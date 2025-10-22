from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import numpy as np
import io
import json
from typing import Optional, List
from pydantic import BaseModel
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Excel Comparison API")

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ComparisonRequest(BaseModel):
    comparison_mode: str = "all"
    selected_columns: List[str] = []
    treat_null_as_zero: bool = False
    selected_sheet1: Optional[str] = None
    selected_sheet2: Optional[str] = None

class MismatchResult(BaseModel):
    row: int
    col: int
    col_name: str
    value1: str
    value2: str

class ComparisonResponse(BaseModel):
    mismatches: List[MismatchResult]
    total_mismatches: int
    columns_affected: int
    total_rows: int
    affected_columns: dict

def clean_value(val):
    """Clean value for JSON serialization"""
    if pd.isna(val):
        return ""
    if isinstance(val, (np.floating, float)):
        if np.isinf(val) or np.isnan(val):
            return ""
        return float(val)
    if isinstance(val, (np.integer, np.int64, np.int32)):
        return int(val)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    return str(val)

def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Clean DataFrame for JSON serialization"""
    df = df.replace([np.inf, -np.inf], np.nan)
    return df

def is_csv_file(filename: str) -> bool:
    """Check if file is CSV"""
    return filename.lower().endswith('.csv')

def is_excel_file(filename: str) -> bool:
    """Check if file is Excel"""
    return filename.lower().endswith(('.xlsx', '.xls', '.xlsm', '.xlsb'))

def read_file(file_content: bytes, filename: str, sheet_name: Optional[str] = None) -> pd.DataFrame:
    """Read CSV or Excel file and return DataFrame"""
    try:
        logger.info(f"Reading file: {filename}, sheet: {sheet_name}")
        
        if is_csv_file(filename):
            csv_file = io.StringIO(file_content.decode('utf-8', errors='ignore'))
            df = pd.read_csv(csv_file)
            logger.info(f"CSV file read successfully: {len(df)} rows, {len(df.columns)} columns")
        elif is_excel_file(filename):
            excel_file = io.BytesIO(file_content)
            engines_to_try = []
            
            if filename.lower().endswith('.xls'):
                engines_to_try = ['xlrd', 'openpyxl']
            else:
                engines_to_try = ['openpyxl']
            
            last_error = None
            for engine in engines_to_try:
                try:
                    logger.info(f"Trying engine: {engine}")
                    excel_file.seek(0)
                    
                    if sheet_name:
                        df = pd.read_excel(excel_file, sheet_name=sheet_name, engine=engine)
                    else:
                        df = pd.read_excel(excel_file, sheet_name=0, engine=engine)
                    
                    logger.info(f"Excel file read successfully with {engine}: {len(df)} rows, {len(df.columns)} columns")
                    break
                except Exception as e:
                    last_error = e
                    logger.warning(f"Engine {engine} failed: {str(e)}")
                    continue
            else:
                raise last_error or Exception("Could not read Excel file with any engine")
        else:
            raise ValueError(f"Unsupported file format: {filename}")
        
        df = clean_dataframe(df)
        return df
    except UnicodeDecodeError as e:
        logger.error(f"Unicode decode error: {str(e)}")
        try:
            csv_file = io.StringIO(file_content.decode('latin-1'))
            df = pd.read_csv(csv_file)
            df = clean_dataframe(df)
            return df
        except Exception as inner_e:
            raise HTTPException(status_code=400, detail=f"Error decoding file: {str(inner_e)}")
    except Exception as e:
        logger.error(f"Error reading file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

def get_sheet_names(file_content: bytes, filename: str) -> List[str]:
    """Get all sheet names from Excel/CSV file"""
    try:
        if is_csv_file(filename):
            return ["Sheet1"]
        
        excel_file = io.BytesIO(file_content)
        
        if filename.lower().endswith('.xls'):
            engine = 'xlrd'
        else:
            engine = 'openpyxl'
        
        excel_data = pd.ExcelFile(excel_file, engine=engine)
        return excel_data.sheet_names
    except Exception as e:
        logger.error(f"Error reading sheet names: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error reading sheet names: {str(e)}")

def normalize_dataframe(df: pd.DataFrame, treat_null_as_zero: bool) -> pd.DataFrame:
    """Vectorized normalization of entire DataFrame"""
    df = df.copy()
    
    # Convert all to string first
    df = df.astype(str)
    
    # Strip whitespace vectorized
    df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
    
    if treat_null_as_zero:
        # Replace null-like values with a sentinel
        null_values = ['nan', 'NaN', 'None', 'null', '[null]', '0', '0.0', '', 'none']
        for col in df.columns:
            df[col] = df[col].replace(null_values, '__NULL_OR_ZERO__')
    
    return df

def dataframe_to_list(df: pd.DataFrame, max_rows: int = None) -> List[List]:
    """Convert DataFrame to list of lists with proper cleaning"""
    if max_rows:
        df = df.head(max_rows)
    
    # Vectorized conversion
    result = df.applymap(clean_value).values.tolist()
    return result

def compare_dataframes_optimized(
    df1: pd.DataFrame, 
    df2: pd.DataFrame, 
    comparison_mode: str,
    selected_columns: List[str],
    treat_null_as_zero: bool
) -> dict:
    """Optimized comparison using vectorized operations"""
    
    import time
    start_time = time.time()
    
    original_rows_df1 = len(df1)
    original_rows_df2 = len(df2)
    max_rows = max(original_rows_df1, original_rows_df2)
    
    logger.info(f"Comparing DataFrames: df1={original_rows_df1} rows, df2={original_rows_df2} rows")
    
    # Determine columns to compare
    if comparison_mode == "all":
        all_columns = list(set(df1.columns.tolist() + df2.columns.tolist()))
        columns_to_compare = all_columns
    else:
        columns_to_compare = selected_columns
    
    # Ensure both DataFrames have same columns
    for col in columns_to_compare:
        if col not in df1.columns:
            df1[col] = ""
        if col not in df2.columns:
            df2[col] = ""
    
    # Reorder columns to match
    df1 = df1[columns_to_compare]
    df2 = df2[columns_to_compare]
    
    # Align to same number of rows
    if len(df1) < max_rows:
        empty_df = pd.DataFrame("", index=range(len(df1), max_rows), columns=df1.columns)
        df1 = pd.concat([df1, empty_df], ignore_index=True)
    if len(df2) < max_rows:
        empty_df = pd.DataFrame("", index=range(len(df2), max_rows), columns=df2.columns)
        df2 = pd.concat([df2, empty_df], ignore_index=True)
    
    logger.info(f"Alignment took: {time.time() - start_time:.2f}s")
    norm_start = time.time()
    
    # Normalize both DataFrames (vectorized)
    df1_norm = normalize_dataframe(df1, treat_null_as_zero)
    df2_norm = normalize_dataframe(df2, treat_null_as_zero)
    
    logger.info(f"Normalization took: {time.time() - norm_start:.2f}s")
    comp_start = time.time()
    
    # Vectorized comparison - find all mismatches at once
    comparison_mask = (df1_norm != df2_norm)
    
    logger.info(f"Comparison took: {time.time() - comp_start:.2f}s")
    extract_start = time.time()
    
    # Get indices where values don't match
    mismatch_indices = np.argwhere(comparison_mask.values)
    
    logger.info(f"Found {len(mismatch_indices)} mismatches")
    logger.info(f"Index extraction took: {time.time() - extract_start:.2f}s")
    build_start = time.time()
    
    # Build mismatch list efficiently
    mismatches = []
    column_mismatch_counts = {}
    
    # Get column names as array for fast lookup
    col_names = df1.columns.tolist()
    
    # Vectorized value extraction
    for row_idx, col_idx in mismatch_indices:
        col_name = col_names[col_idx]
        
        # Use iloc for faster access
        val1 = df1.iloc[row_idx, col_idx]
        val2 = df2.iloc[row_idx, col_idx]
        
        mismatches.append({
            "row": int(row_idx),
            "col": int(col_idx),
            "col_name": col_name,
            "value1": clean_value(val1),
            "value2": clean_value(val2)
        })
        
        column_mismatch_counts[col_name] = column_mismatch_counts.get(col_name, 0) + 1
    
    logger.info(f"Mismatch building took: {time.time() - build_start:.2f}s")
    logger.info(f"Total comparison time: {time.time() - start_time:.2f}s")
    
    return {
        "mismatches": mismatches,
        "total_mismatches": len(mismatches),
        "columns_affected": len(column_mismatch_counts),
        "total_rows": max_rows,
        "affected_columns": column_mismatch_counts
    }

@app.get("/")
async def root():
    return {"message": "Excel Comparison API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/api/upload/sheets")
async def get_sheets(file: UploadFile = File(...)):
    """Get sheet names from uploaded Excel/CSV file"""
    try:
        logger.info(f"Received file: {file.filename}, content_type: {file.content_type}")
        
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded")
        
        if not (is_csv_file(file.filename) or is_excel_file(file.filename)):
            raise HTTPException(
                status_code=400, 
                detail="Only Excel files (.xlsx, .xls, .xlsm, .xlsb) and CSV files (.csv) are supported"
            )
        
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file uploaded")
        
        logger.info(f"File size: {len(content)} bytes")
        
        sheets = get_sheet_names(content, file.filename)
        logger.info(f"Sheets found: {sheets}")
        
        return {"sheets": sheets}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/api/preview")
async def preview_data(
    file: UploadFile = File(...),
    sheet_name: Optional[str] = Form(None),
    max_rows: int = Form(100)
):
    """Preview Excel/CSV data (first N rows)"""
    try:
        logger.info(f"Preview request for: {file.filename}, sheet: {sheet_name}")
        
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded")
        
        if not (is_csv_file(file.filename) or is_excel_file(file.filename)):
            raise HTTPException(
                status_code=400, 
                detail="Only Excel files (.xlsx, .xls, .xlsm, .xlsb) and CSV files (.csv) are supported"
            )
        
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file uploaded")
        
        logger.info(f"Reading file for preview, size: {len(content)} bytes")
        
        if is_csv_file(file.filename):
            sheet_name = None
        
        df = read_file(content, file.filename, sheet_name)
        
        logger.info(f"DataFrame loaded: {len(df)} rows, {len(df.columns)} columns")
        
        preview_data = dataframe_to_list(df, max_rows)
        headers = [str(col) for col in df.columns.tolist()]
        
        return {
            "headers": headers,
            "data": preview_data,
            "total_rows": len(df),
            "total_columns": len(headers)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error previewing file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error previewing file: {str(e)}")

@app.post("/api/compare")
async def compare_excel(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    comparison_mode: str = Form("all"),
    selected_columns: str = Form("[]"),
    treat_null_as_zero: bool = Form(False),
    sheet_name1: Optional[str] = Form(None),
    sheet_name2: Optional[str] = Form(None)
):
    """Compare two Excel/CSV files"""
    try:
        logger.info(f"Comparison request: {file1.filename} vs {file2.filename}")
        
        if not file1.filename or not file2.filename:
            raise HTTPException(status_code=400, detail="Both files must be uploaded")
        
        if not (is_csv_file(file1.filename) or is_excel_file(file1.filename)):
            raise HTTPException(status_code=400, detail=f"File 1 format not supported: {file1.filename}")
        
        if not (is_csv_file(file2.filename) or is_excel_file(file2.filename)):
            raise HTTPException(status_code=400, detail=f"File 2 format not supported: {file2.filename}")
        
        try:
            selected_cols = json.loads(selected_columns)
        except:
            selected_cols = []
        
        content1 = await file1.read()
        content2 = await file2.read()
        
        if not content1 or not content2:
            raise HTTPException(status_code=400, detail="One or both files are empty")
        
        logger.info(f"File sizes: {len(content1)} and {len(content2)} bytes")
        
        if is_csv_file(file1.filename):
            sheet_name1 = None
        if is_csv_file(file2.filename):
            sheet_name2 = None
        
        df1 = read_file(content1, file1.filename, sheet_name1)
        df2 = read_file(content2, file2.filename, sheet_name2)
        
        logger.info(f"DataFrames loaded: {len(df1)}x{len(df1.columns)} vs {len(df2)}x{len(df2.columns)}")
        
        original_rows_1 = len(df1)
        original_rows_2 = len(df2)
        
        # Use optimized comparison
        result = compare_dataframes_optimized(
            df1, df2, 
            comparison_mode, 
            selected_cols, 
            treat_null_as_zero
        )
        
        result["file1_rows"] = original_rows_1
        result["file2_rows"] = original_rows_2
        result["file1_columns"] = len(df1.columns)
        result["file2_columns"] = len(df2.columns)
        
        result["columns1"] = [str(col) for col in df1.columns.tolist()]
        result["columns2"] = [str(col) for col in df2.columns.tolist()]
        
        result["data1_sample"] = dataframe_to_list(df1, 1000)
        result["data2_sample"] = dataframe_to_list(df2, 1000)
        result["headers1"] = [str(col) for col in df1.columns.tolist()]
        result["headers2"] = [str(col) for col in df2.columns.tolist()]
        
        logger.info(f"Comparison complete: {result['total_mismatches']} mismatches found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing files: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error comparing files: {str(e)}")

@app.post("/api/compare/large")
async def compare_excel_large(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    comparison_mode: str = Form("all"),
    selected_columns: str = Form("[]"),
    treat_null_as_zero: bool = Form(False),
    sheet_name1: Optional[str] = Form(None),
    sheet_name2: Optional[str] = Form(None),
    chunk_size: int = Form(100000)
):
    """Compare large Excel/CSV files - now uses optimized algorithm"""
    try:
        logger.info(f"Large comparison request: {file1.filename} vs {file2.filename}")
        
        if not file1.filename or not file2.filename:
            raise HTTPException(status_code=400, detail="Both files must be uploaded")
        
        if not (is_csv_file(file1.filename) or is_excel_file(file1.filename)):
            raise HTTPException(status_code=400, detail=f"File 1 format not supported: {file1.filename}")
        
        if not (is_csv_file(file2.filename) or is_excel_file(file2.filename)):
            raise HTTPException(status_code=400, detail=f"File 2 format not supported: {file2.filename}")
        
        try:
            selected_cols = json.loads(selected_columns)
        except:
            selected_cols = []
        
        content1 = await file1.read()
        content2 = await file2.read()
        
        if not content1 or not content2:
            raise HTTPException(status_code=400, detail="One or both files are empty")
        
        if is_csv_file(file1.filename):
            sheet_name1 = None
        if is_csv_file(file2.filename):
            sheet_name2 = None
        
        df1 = read_file(content1, file1.filename, sheet_name1)
        df2 = read_file(content2, file2.filename, sheet_name2)
        
        original_rows_1 = len(df1)
        original_rows_2 = len(df2)
        
        # Use optimized comparison (can handle millions of rows efficiently)
        result = compare_dataframes_optimized(
            df1, df2, 
            comparison_mode, 
            selected_cols, 
            treat_null_as_zero
        )
        
        result["file1_rows"] = original_rows_1
        result["file2_rows"] = original_rows_2
        result["file1_columns"] = len(df1.columns)
        result["file2_columns"] = len(df2.columns)
        
        result["columns1"] = [str(col) for col in df1.columns.tolist()]
        result["columns2"] = [str(col) for col in df2.columns.tolist()]
        
        result["data1_sample"] = dataframe_to_list(df1, 1000)
        result["data2_sample"] = dataframe_to_list(df2, 1000)
        result["headers1"] = [str(col) for col in df1.columns.tolist()]
        result["headers2"] = [str(col) for col in df2.columns.tolist()]
        
        logger.info(f"Large comparison complete: {result['total_mismatches']} mismatches found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing files: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error comparing files: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)