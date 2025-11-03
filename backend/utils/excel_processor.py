import pandas as pd
import numpy as np
from typing import List, Dict, Tuple, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ExcelProcessor:
    """Advanced Excel processing utilities"""
    
    @staticmethod
    def chunk_dataframe(df: pd.DataFrame, chunk_size: int = 10000):
        """Generator to process DataFrame in chunks"""
        num_chunks = len(df) // chunk_size + (1 if len(df) % chunk_size else 0)
        for i in range(num_chunks):
            start_idx = i * chunk_size
            end_idx = min((i + 1) * chunk_size, len(df))
            yield df.iloc[start_idx:end_idx], start_idx
    
    @staticmethod
    def normalize_columns(df1: pd.DataFrame, df2: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Ensure both DataFrames have the same columns"""
        all_columns = list(set(df1.columns.tolist() + df2.columns.tolist()))
        
        for col in all_columns:
            if col not in df1.columns:
                df1[col] = pd.NA
            if col not in df2.columns:
                df2[col] = pd.NA
        
        # Reorder columns to match
        df1 = df1[all_columns]
        df2 = df2[all_columns]
        
        return df1, df2
    
    @staticmethod
    def normalize_value(val, treat_null_as_zero: bool = False) -> str:
        """Normalize values for comparison"""
        if pd.isna(val):
            val_str = ""
        else:
            val_str = str(val).strip()
        
        if not treat_null_as_zero:
            return val_str
        
        # Treat NULL-like values and zero as equivalent
        val_lower = val_str.lower()
        if val_lower in ['null', '[null]', '0', '0.0', '', 'nan', 'none']:
            return '__NULL_OR_ZERO__'
        
        return val_str
    
    @staticmethod
    def compare_chunks(
        df1: pd.DataFrame, 
        df2: pd.DataFrame, 
        columns_to_compare: List[str],
        treat_null_as_zero: bool = False,
        row_offset: int = 0
    ) -> List[Dict]:
        """Compare two DataFrame chunks"""
        mismatches = []
        
        # Ensure same number of rows
        max_rows = max(len(df1), len(df2))
        
        if len(df1) < max_rows:
            empty_rows = pd.DataFrame([[pd.NA] * len(df1.columns)] * (max_rows - len(df1)), 
                                     columns=df1.columns)
            df1 = pd.concat([df1, empty_rows], ignore_index=True)
        
        if len(df2) < max_rows:
            empty_rows = pd.DataFrame([[pd.NA] * len(df2.columns)] * (max_rows - len(df2)), 
                                     columns=df2.columns)
            df2 = pd.concat([df2, empty_rows], ignore_index=True)
        
        for col in columns_to_compare:
            if col not in df1.columns or col not in df2.columns:
                continue
            
            col_idx = list(df1.columns).index(col)
            
            for row_idx in range(len(df1)):
                val1 = df1.iloc[row_idx][col]
                val2 = df2.iloc[row_idx][col]
                
                normalized_val1 = ExcelProcessor.normalize_value(val1, treat_null_as_zero)
                normalized_val2 = ExcelProcessor.normalize_value(val2, treat_null_as_zero)
                
                if normalized_val1 != normalized_val2:
                    mismatches.append({
                        "row": row_idx + row_offset,
                        "col": col_idx,
                        "col_name": col,
                        "value1": str(val1) if not pd.isna(val1) else "",
                        "value2": str(val2) if not pd.isna(val2) else ""
                    })
        
        return mismatches
    
    @staticmethod
    def get_column_statistics(df: pd.DataFrame) -> Dict:
        """Get statistics about DataFrame columns"""
        stats = {}
        
        for col in df.columns:
            col_data = df[col]
            stats[col] = {
                "dtype": str(col_data.dtype),
                "null_count": int(col_data.isna().sum()),
                "unique_count": int(col_data.nunique()),
                "sample_values": col_data.dropna().head(5).tolist()
            }
        
        return stats
    
    @staticmethod
    def memory_efficient_compare(
        df1: pd.DataFrame,
        df2: pd.DataFrame,
        comparison_mode: str = "all",
        selected_columns: List[str] = None,
        treat_null_as_zero: bool = False,
        chunk_size: int = 10000
    ) -> Dict:
        """Memory-efficient comparison for large DataFrames"""
        
        logger.info(f"Starting comparison: df1={len(df1)} rows, df2={len(df2)} rows")
        
        # Normalize columns
        df1, df2 = ExcelProcessor.normalize_columns(df1, df2)
        
        # Determine columns to compare
        if comparison_mode == "all":
            columns_to_compare = df1.columns.tolist()
        else:
            columns_to_compare = selected_columns or []
        
        # Align row counts
        max_rows = max(len(df1), len(df2))
        
        if len(df1) < max_rows:
            empty_rows = pd.DataFrame([[pd.NA] * len(df1.columns)] * (max_rows - len(df1)), 
                                     columns=df1.columns)
            df1 = pd.concat([df1, empty_rows], ignore_index=True)
        
        if len(df2) < max_rows:
            empty_rows = pd.DataFrame([[pd.NA] * len(df2.columns)] * (max_rows - len(df2)), 
                                     columns=df2.columns)
            df2 = pd.concat([df2, empty_rows], ignore_index=True)
        
        # Process in chunks if dataset is large
        all_mismatches = []
        column_mismatch_counts = {}
        
        if max_rows <= chunk_size:
            # Small dataset - process all at once
            all_mismatches = ExcelProcessor.compare_chunks(
                df1, df2, columns_to_compare, treat_null_as_zero, 0
            )
        else:
            # Large dataset - process in chunks
            num_chunks = max_rows // chunk_size + (1 if max_rows % chunk_size else 0)
            logger.info(f"Processing {num_chunks} chunks of {chunk_size} rows each")
            
            for i in range(num_chunks):
                start_idx = i * chunk_size
                end_idx = min((i + 1) * chunk_size, max_rows)
                
                df1_chunk = df1.iloc[start_idx:end_idx]
                df2_chunk = df2.iloc[start_idx:end_idx]
                
                chunk_mismatches = ExcelProcessor.compare_chunks(
                    df1_chunk, df2_chunk, columns_to_compare, treat_null_as_zero, start_idx
                )
                
                all_mismatches.extend(chunk_mismatches)
                
                logger.info(f"Processed chunk {i+1}/{num_chunks}: {len(chunk_mismatches)} mismatches found")
        
        # Calculate column mismatch counts
        for mismatch in all_mismatches:
            col_name = mismatch["col_name"]
            if col_name not in column_mismatch_counts:
                column_mismatch_counts[col_name] = 0
            column_mismatch_counts[col_name] += 1
        
        logger.info(f"Comparison complete: {len(all_mismatches)} total mismatches")
        
        return {
            "mismatches": all_mismatches,
            "total_mismatches": len(all_mismatches),
            "columns_affected": len(column_mismatch_counts),
            "total_rows": max_rows,
            "affected_columns": column_mismatch_counts
        }