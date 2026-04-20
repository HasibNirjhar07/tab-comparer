#!/usr/bin/env python3
import argparse
import json
import sys
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional, Tuple

Json = Any

# -------------------------
# JSONL loader
# -------------------------
def load_jsonl(path: str) -> Iterable[Tuple[int, Optional[Json], Optional[str]]]:
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, start=1):
            s = line.strip()
            if not s:
                continue
            try:
                yield i, json.loads(s), None
            except Exception as e:
                yield i, None, str(e)

# -------------------------
# Path utilities
# -------------------------
def get_path(obj: Json, path: str) -> Any:
    """
    Get value by a dotted path.
    Supports:
      - dotted keys: a.b.c
      - array selection:
          - [] wildcard: a.b[]  (returns list elements)
          - [N] index: a.b[0]
    """
    cur = obj
    if path == "" or path is None:
        return cur

    parts = path.split(".")
    for part in parts:
        if part.endswith("[]"):
            key = part[:-2]
            if not isinstance(cur, dict):
                return None
            cur = cur.get(key)
            if not isinstance(cur, list):
                return None
            return cur  # stop here; caller handles iteration
        elif "[" in part and part.endswith("]"):
            # key[3]
            key, idx_s = part[:-1].split("[", 1)
            if not isinstance(cur, dict):
                return None
            cur = cur.get(key)
            try:
                idx = int(idx_s)
            except ValueError:
                return None
            if not isinstance(cur, list) or idx < 0 or idx >= len(cur):
                return None
            cur = cur[idx]
        else:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(part)
            if cur is None:
                return None
    return cur

def iter_records(line_obj: Json, record_path: str) -> List[Json]:
    """
    Extract logical records from one JSONL line.
    record_path can point to:
      - an array (use []): callEventRecords[]
      - a single object: pGWRecord
      - empty string: "" means the whole line is one record
    """
    if record_path is None:
        record_path = ""
    record_path = record_path.strip()

    if record_path == "":
        return [line_obj]

    val = get_path(line_obj, record_path)
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]

# -------------------------
# Normalization + diff
# -------------------------
def should_ignore(path: str, ignore_paths: set) -> bool:
    # Ignore exact path or any descendant of ignored prefix
    for ig in ignore_paths:
        if path == ig or path.startswith(ig + ".") or path.startswith(ig + "["):
            return True
    return False

def normalize(obj: Json, ignore_paths: set, path: str = "") -> Json:
    if should_ignore(path, ignore_paths):
        return None

    if isinstance(obj, dict):
        out = {}
        for k in sorted(obj.keys()):
            p = f"{path}.{k}" if path else k
            if should_ignore(p, ignore_paths):
                continue
            out[k] = normalize(obj[k], ignore_paths, p)
        return out

    if isinstance(obj, list):
        out_list = []
        for i, v in enumerate(obj):
            p = f"{path}[{i}]"
            if should_ignore(p, ignore_paths):
                continue
            out_list.append(normalize(v, ignore_paths, p))
        return out_list

    return obj

def deep_diff(a: Json, b: Json, path: str = "") -> List[Tuple[str, str, Json, Json]]:
    diffs = []
    if type(a) != type(b):
        diffs.append((path, "type", a, b))
        return diffs

    if isinstance(a, dict):
        a_keys, b_keys = set(a.keys()), set(b.keys())
        for k in sorted(a_keys - b_keys):
            diffs.append((f"{path}.{k}" if path else k, "missing_in_b", a[k], None))
        for k in sorted(b_keys - a_keys):
            diffs.append((f"{path}.{k}" if path else k, "missing_in_a", None, b[k]))
        for k in sorted(a_keys & b_keys):
            p = f"{path}.{k}" if path else k
            diffs.extend(deep_diff(a[k], b[k], p))
        return diffs

    if isinstance(a, list):
        if len(a) != len(b):
            diffs.append((path, "value", f"len={len(a)}", f"len={len(b)}"))
        for idx, (av, bv) in enumerate(zip(a, b)):
            diffs.extend(deep_diff(av, bv, f"{path}[{idx}]"))
        return diffs

    if a != b:
        diffs.append((path, "value", a, b))
    return diffs

# -------------------------
# Keying + indexing
# -------------------------
def build_key(rec: Json, key_fields: List[str], key_sep: str) -> Optional[str]:
    """
    Create a stable key from one or more paths.
    Example: --key-field chargingID --key-field servedIMSI
    """
    parts = []
    for kf in key_fields:
        v = get_path(rec, kf)
        if v is None:
            return None
        parts.append(str(v))
    return key_sep.join(parts)

def index_jsonl(path: str, record_path: str, key_fields: List[str], key_sep: str,
               ignore_paths: set) -> Tuple[Dict[str, Tuple[int, Json]], List[Tuple[int, str]]]:
    """
    Returns: index[key] = (line_no, normalized_record), plus errors list.
    """
    idx: Dict[str, Tuple[int, Json]] = {}
    errors: List[Tuple[int, str]] = []
    dup_count = 0

    for line_no, obj, err in load_jsonl(path):
        if err:
            errors.append((line_no, f"JSON parse error: {err}"))
            continue
        if obj is None:
            continue

        records = iter_records(obj, record_path)
        if not records:
            # not an error by default; could be header-only line
            continue

        for rec in records:
            if not isinstance(rec, (dict, list)):
                errors.append((line_no, "Record is not an object/list"))
                continue

            k = build_key(rec, key_fields, key_sep) if key_fields else str(line_no)
            if k is None:
                errors.append((line_no, f"Missing key field(s) {key_fields}"))
                continue

            norm = normalize(rec, ignore_paths)
            if k in idx:
                dup_count += 1
                # keep latest occurrence; also log it
                errors.append((line_no, f"Duplicate key encountered: {k} (overwriting previous)"))
            idx[k] = (line_no, norm)

    if dup_count:
        errors.append((0, f"Total duplicate keys overwritten: {dup_count}"))
    return idx, errors

# -------------------------
# Main compare
# -------------------------
def main():
    ap = argparse.ArgumentParser(description="Generic, configurable JSONL comparator (no hardcoding).")
    ap.add_argument("file_a")
    ap.add_argument("file_b")

    ap.add_argument("--record-path-a", default="", help="Path to records in A. Use [] for arrays. Default: whole line.")
    ap.add_argument("--record-path-b", default="", help="Path to records in B. Use [] for arrays. Default: whole line.")

    ap.add_argument("--key-field", action="append", default=[],
                    help="Repeatable. Path(s) used to build the record key. If omitted, compares by line number.")
    ap.add_argument("--key-sep", default="|", help="Separator for composite keys. Default: |")

    ap.add_argument("--ignore", action="append", default=[],
                    help="Ignore field path(s) (repeatable). Example: --ignore meta.traceId --ignore ingest_ts")

    ap.add_argument("--max-samples", type=int, default=20)
    args = ap.parse_args()

    ignore_paths = set(x.strip() for x in args.ignore if x.strip())

    # If no key fields, compare by line number (less ideal if order differs).
    use_key = len(args.key_field) > 0
    if not use_key:
        print("NOTE: No --key-field provided; comparing by line number (best only if ordering matches).", file=sys.stderr)

    idx_a, errs_a = index_jsonl(args.file_a, args.record_path_a, args.key_field, args.key_sep, ignore_paths)
    idx_b, errs_b = index_jsonl(args.file_b, args.record_path_b, args.key_field, args.key_sep, ignore_paths)

    keys_a = set(idx_a.keys())
    keys_b = set(idx_b.keys())

    only_a = sorted(keys_a - keys_b)
    only_b = sorted(keys_b - keys_a)
    common = sorted(keys_a & keys_b)

    diffs_by_field = Counter()
    mismatch_samples = []
    mismatch_count = 0

    for k in common:
        la, ra = idx_a[k]
        lb, rb = idx_b[k]
        dd = deep_diff(ra, rb)
        if dd:
            mismatch_count += 1
            for p, kind, av, bv in dd:
                diffs_by_field[(p, kind)] += 1
            if len(mismatch_samples) < args.max_samples:
                mismatch_samples.append((k, la, lb, dd[:200]))

    print("=== SUMMARY ===")
    if use_key:
        print(f"Key fields: {args.key_field} (sep='{args.key_sep}')")
    else:
        print("Key fields: (none) -> line-number keying")
    print(f"A records: {len(idx_a)} | B records: {len(idx_b)}")
    print(f"Only in A: {len(only_a)} | Only in B: {len(only_b)}")
    print(f"Mismatched common records: {mismatch_count}")
    print(f"A errors: {len(errs_a)} | B errors: {len(errs_b)}")
    print()

    if only_a:
        print("=== ONLY IN A (sample) ===")
        for k in only_a[:50]:
            print(k)
        print()

    if only_b:
        print("=== ONLY IN B (sample) ===")
        for k in only_b[:50]:
            print(k)
        print()

    print("=== TOP FIELD DIFFS ===")
    for (p, kind), c in diffs_by_field.most_common(50):
        print(f"{c:7d}  {kind:13s}  {p}")
    print()

    if mismatch_samples:
        print("=== SAMPLE MISMATCHES ===")
        for k, la, lb, dd in mismatch_samples:
            print(f"- key={k!r} (A line {la} vs B line {lb}):")
            for p, kind, av, bv in dd[:20]:
                print(f"    {kind:13s} {p}: {av!r}  !=  {bv!r}")
            print()

    if errs_a or errs_b:
        print("=== ERRORS (sample) ===")
        if errs_a:
            print("A:")
            for ln, e in errs_a[:30]:
                print(f"  line {ln}: {e}")
        if errs_b:
            print("B:")
            for ln, e in errs_b[:30]:
                print(f"  line {ln}: {e}")

if __name__ == "__main__":
    main()
