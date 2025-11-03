from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import numpy as np
import io
import json
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import logging
from concurrent.futures import ThreadPoolExecutor
import asyncio
import os
from dotenv import load_dotenv

# PDF processing libraries
import pdfplumber
import PyPDF2

# Google Gemini
import google.generativeai as genai

load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Excel & PDF Comparison API with AI")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyC41RoUNUYb_q6hJERw99DJr3f-oz2OMRc")

# Initialize Gemini model
model = None
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        
        # First, list all available models for debugging
        try:
            available = genai.list_models()
            logger.info("📋 Available Gemini models:")
            available_names = []
            for m in available:
                if 'generateContent' in m.supported_generation_methods:
                    logger.info(f"  - {m.name}")
                    available_names.append(m.name)
            
            # Prefer Flash models (better free tier: 15 RPM, 1500 RPD vs Pro's very limited quota)
            flash_model = None
            for name in available_names:
                if 'flash' in name.lower():
                    flash_model = name
                    break
            
            # Use Flash if available, otherwise use first available
            selected_model = flash_model if flash_model else (available_names[0] if available_names else None)
            
            if selected_model:
                model = genai.GenerativeModel(selected_model)
                logger.info(f"✅ Gemini AI initialized with model: {selected_model}")
                if 'flash' in selected_model.lower():
                    logger.info("   💡 Using Flash model - better free tier limits!")
            else:
                raise Exception("No models with generateContent support found")
                
        except Exception as list_error:
            logger.warning(f"Could not list models, trying fallback: {list_error}")
            
            # Fallback: Try models in order of preference
            model_names = [
                'models/gemini-1.5-flash-latest',
                'models/gemini-1.5-flash-002',
                'models/gemini-1.5-flash-001',
                'models/gemini-1.5-flash',
                'models/gemini-1.5-pro-latest',
                'models/gemini-1.5-pro',
                'models/gemini-pro',
                'models/gemini-1.0-pro',
                'gemini-1.5-flash-latest',
                'gemini-pro'
            ]
            
            for model_name in model_names:
                try:
                    test_model = genai.GenerativeModel(model_name)
                    model = test_model
                    logger.info(f"✅ Gemini AI initialized successfully with model: {model_name}")
                    break
                except Exception as e:
                    logger.debug(f"Model {model_name} not available: {str(e)}")
                    continue
        
        if not model:
            logger.error("❌ No suitable Gemini model found")
            
    except Exception as e:
        logger.error(f"❌ Failed to initialize Gemini: {str(e)}")
        model = None
else:
    logger.warning("⚠️ Gemini API key not found. AI comparison will not be available.")


class ComparisonRequest(BaseModel):
    comparison_mode: str = "all"
    selected_columns: List[str] = []
    treat_null_as_zero: bool = False
    selected_sheet1: Optional[str] = None
    selected_sheet2: Optional[str] = None

class PDFComparisonRequest(BaseModel):
    user_instruction: str
    pdf_content: str
    excel_data: Dict[str, Any]

def clean_value(val):
    """Ultra-fast value cleaning"""
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

def is_csv_file(filename: str) -> bool:
    return filename.lower().endswith('.csv')

def is_excel_file(filename: str) -> bool:
    return filename.lower().endswith(('.xlsx', '.xls', '.xlsm', '.xlsb'))

def is_pdf_file(filename: str) -> bool:
    return filename.lower().endswith('.pdf')

def extract_pdf_content(file_content: bytes) -> Dict[str, Any]:
    """Extract text and tables from PDF using multiple methods for robustness"""
    import time
    start_time = time.time()
    
    extracted_data = {
        "text": "",
        "tables": [],
        "page_count": 0,
        "metadata": {},
        "extraction_method": ""
    }
    
    try:
        pdf_file = io.BytesIO(file_content)
        
        # Method 1: Try pdfplumber first (best for tables)
        try:
            with pdfplumber.open(pdf_file) as pdf:
                extracted_data["page_count"] = len(pdf.pages)
                extracted_data["extraction_method"] = "pdfplumber"
                
                # Extract text from all pages
                full_text = []
                for page_num, page in enumerate(pdf.pages):
                    try:
                        # Try different extraction settings
                        page_text = page.extract_text(
                            x_tolerance=3,
                            y_tolerance=3,
                            layout=True,
                            x_density=7.25,
                            y_density=13
                        )
                        
                        if not page_text:
                            # Fallback to simpler extraction
                            page_text = page.extract_text()
                        
                        if page_text:
                            full_text.append(f"--- Page {page_num + 1} ---\n{page_text}")
                        
                        # Extract tables with error handling
                        try:
                            tables = page.extract_tables()
                            for table_idx, table in enumerate(tables):
                                if table and len(table) > 0:
                                    # Clean table data
                                    cleaned_table = []
                                    for row in table:
                                        cleaned_row = [str(cell).strip() if cell else "" for cell in row]
                                        cleaned_table.append(cleaned_row)
                                    
                                    # Create DataFrame safely
                                    if len(cleaned_table) > 1:
                                        headers = cleaned_table[0]
                                        data_rows = cleaned_table[1:]
                                        
                                        try:
                                            df = pd.DataFrame(data_rows, columns=headers)
                                            extracted_data["tables"].append({
                                                "page": page_num + 1,
                                                "table_index": table_idx,
                                                "data": df.to_dict('records'),
                                                "headers": headers,
                                                "raw": cleaned_table
                                            })
                                        except:
                                            # If DataFrame fails, store raw table
                                            extracted_data["tables"].append({
                                                "page": page_num + 1,
                                                "table_index": table_idx,
                                                "raw": cleaned_table
                                            })
                        except Exception as table_error:
                            logger.warning(f"Table extraction failed on page {page_num + 1}: {str(table_error)}")
                    
                    except Exception as page_error:
                        logger.warning(f"Page {page_num + 1} extraction error: {str(page_error)}")
                        continue
                
                extracted_data["text"] = "\n\n".join(full_text)
                
                # If pdfplumber got nothing, try PyPDF2
                if not extracted_data["text"] and not extracted_data["tables"]:
                    raise Exception("pdfplumber extracted no content, trying fallback")
                
        except Exception as pdfplumber_error:
            logger.warning(f"pdfplumber failed: {str(pdfplumber_error)}, trying PyPDF2")
            
            # Method 2: Fallback to PyPDF2
            pdf_file.seek(0)
            try:
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                extracted_data["page_count"] = len(pdf_reader.pages)
                extracted_data["extraction_method"] = "PyPDF2"
                
                full_text = []
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            full_text.append(f"--- Page {page_num + 1} ---\n{page_text}")
                    except Exception as page_error:
                        logger.warning(f"PyPDF2 page {page_num + 1} error: {str(page_error)}")
                        continue
                
                extracted_data["text"] = "\n\n".join(full_text)
                
                if not extracted_data["text"]:
                    raise Exception("PyPDF2 also extracted no content")
                    
            except Exception as pypdf_error:
                logger.error(f"PyPDF2 also failed: {str(pypdf_error)}")
                raise HTTPException(
                    status_code=400, 
                    detail=f"Failed to extract PDF content. The PDF might be encrypted, scanned, or corrupted. Error: {str(pypdf_error)}"
                )
        
        # Validate extraction
        if not extracted_data["text"] and not extracted_data["tables"]:
            raise HTTPException(
                status_code=400,
                detail="PDF extraction returned no content. The PDF might be image-based (scanned) or empty. Please try a text-based PDF."
            )
        
        logger.info(
            f"✓ PDF extracted using {extracted_data['extraction_method']}: "
            f"{extracted_data['page_count']} pages, "
            f"{len(extracted_data['tables'])} tables, "
            f"{len(extracted_data['text'])} chars in {time.time() - start_time:.2f}s"
        )
        
        return extracted_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ PDF extraction error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=400, 
            detail=f"Error extracting PDF: {str(e)}. Please ensure the PDF is not password-protected or corrupted."
        )

async def ai_compare_pdf_excel(
    pdf_data: Dict[str, Any],
    excel_df: pd.DataFrame,
    user_instruction: str
) -> Dict[str, Any]:
    """Use Gemini AI to intelligently compare PDF and Excel data"""
    
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    
    if not model:
        raise HTTPException(status_code=500, detail="Gemini AI model not initialized")
    
    try:
        # Prepare context for AI
        excel_preview = excel_df.head(50).to_string()
        excel_columns = excel_df.columns.tolist()
        excel_shape = f"{len(excel_df)} rows × {len(excel_df.columns)} columns"
        
        # Build PDF context
        pdf_context = f"PDF has {pdf_data['page_count']} pages\n"
        pdf_context += f"Found {len(pdf_data['tables'])} tables\n\n"
        
        if pdf_data['tables']:
            pdf_context += "PDF Tables:\n"
            for i, table in enumerate(pdf_data['tables'][:3]):  # Limit to first 3 tables
                pdf_context += f"\nTable {i+1} (Page {table['page']}):\n"
                pdf_context += f"Headers: {table.get('headers', [])}\n"
                if 'data' in table:
                    df_table = pd.DataFrame(table['data'])
                    pdf_context += df_table.head(20).to_string() + "\n"
                elif 'raw' in table:
                    pdf_context += f"Raw table data: {str(table['raw'][:5])}\n"
        
        if pdf_data['text']:
            pdf_context += f"\n\nPDF Text Content (first 3000 chars):\n{pdf_data['text'][:3000]}"
        
        # Create prompt for Gemini
        prompt = f"""You are an expert data analyst comparing PDF content with Excel data.

USER REQUEST: {user_instruction}

EXCEL DATA:
- Shape: {excel_shape}
- Columns: {excel_columns}
- Preview:
{excel_preview}

PDF CONTENT:
{pdf_context}

TASK:
1. Understand what the user wants to compare based on their instruction
2. Identify relevant data from both PDF and Excel
3. Perform intelligent matching and comparison
4. Find mismatches, missing data, or discrepancies
5. Provide clear, actionable results

OUTPUT FORMAT (JSON):
{{
    "understanding": "Brief summary of what you understood from the user's request",
    "comparison_strategy": "How you approached the comparison",
    "matches": [
        {{"pdf_value": "...", "excel_value": "...", "location": "...", "status": "match"}}
    ],
    "mismatches": [
        {{"pdf_value": "...", "excel_value": "...", "location": "...", "difference": "...", "status": "mismatch"}}
    ],
    "missing_in_excel": ["..."],
    "missing_in_pdf": ["..."],
    "summary": "Overall comparison summary with counts and key findings",
    "confidence": "high/medium/low - your confidence in this comparison"
}}

Provide detailed, accurate comparison results in valid JSON format."""

        logger.info("🤖 Calling Gemini AI for comparison...")
        
        response = model.generate_content(prompt)
        
        # Parse JSON response
        result_text = response.text.strip()
        
        # Extract JSON if wrapped in markdown
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0].strip()
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0].strip()
        
        # Clean up control characters that break JSON parsing
        import re
        # Remove control characters except newlines and tabs
        result_text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', result_text)
        
        result = json.loads(result_text)
        
        logger.info("✅ AI comparison complete")
        return result
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ Failed to parse AI response as JSON: {str(e)}")
        logger.debug(f"Raw response: {result_text[:500] if 'result_text' in locals() else 'N/A'}")
        # Return raw response if JSON parsing fails
        return {
            "error": "Failed to parse AI response",
            "raw_response": response.text if 'response' in locals() else "No response",
            "understanding": "The AI returned a response but it couldn't be parsed as JSON",
            "summary": response.text[:1000] if 'response' in locals() else "Error occurred",
            "note": "The comparison may have completed but the format was unexpected. Check raw_response for details."
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ AI comparison error: {error_msg}")
        
        # Check for quota errors
        if "429" in error_msg or "quota" in error_msg.lower() or "exceeded" in error_msg.lower():
            raise HTTPException(
                status_code=429, 
                detail="API quota exceeded. Please try again later or use a different API key. You may need to upgrade your plan at https://aistudio.google.com/"
            )
        
        raise HTTPException(status_code=500, detail=f"AI comparison failed: {error_msg}")

def read_file_ultrafast(file_content: bytes, filename: str, sheet_name: Optional[str] = None) -> pd.DataFrame:
    """Ultra-optimized file reading"""
    import time
    start_time = time.time()
    
    try:
        if is_csv_file(filename):
            try:
                df = pd.read_csv(io.BytesIO(file_content), engine='pyarrow', dtype_backend='pyarrow')
                logger.info(f"✓ CSV read with pyarrow: {time.time() - start_time:.2f}s")
            except:
                try:
                    df = pd.read_csv(io.BytesIO(file_content), engine='c', low_memory=False)
                    logger.info(f"✓ CSV read with C engine: {time.time() - start_time:.2f}s")
                except:
                    csv_file = io.StringIO(file_content.decode('utf-8', errors='ignore'))
                    df = pd.read_csv(csv_file, low_memory=False)
                    logger.info(f"✓ CSV read (standard): {time.time() - start_time:.2f}s")
                
        elif is_excel_file(filename):
            excel_file = io.BytesIO(file_content)
            
            if filename.lower().endswith(('.xlsx', '.xlsm', '.xlsb')):
                try:
                    df = pd.read_excel(excel_file, sheet_name=sheet_name or 0, engine='calamine')
                    logger.info(f"✓ Excel read with calamine: {time.time() - start_time:.2f}s")
                except:
                    excel_file.seek(0)
                    df = pd.read_excel(excel_file, sheet_name=sheet_name or 0, engine='openpyxl')
                    logger.info(f"✓ Excel read with openpyxl: {time.time() - start_time:.2f}s")
            else:
                df = pd.read_excel(excel_file, sheet_name=sheet_name or 0, engine='xlrd')
                logger.info(f"✓ XLS read: {time.time() - start_time:.2f}s")
        else:
            raise ValueError(f"Unsupported format: {filename}")
        
        logger.info(f"📊 Loaded: {len(df):,} rows × {len(df.columns)} cols")
        return df
        
    except Exception as e:
        logger.error(f"❌ Read error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

async def read_files_parallel(content1: bytes, filename1: str, sheet1: Optional[str],
                              content2: bytes, filename2: str, sheet2: Optional[str]):
    """Read files in parallel"""
    loop = asyncio.get_event_loop()
    
    with ThreadPoolExecutor(max_workers=2) as executor:
        df1_future = loop.run_in_executor(executor, read_file_ultrafast, content1, filename1, sheet1)
        df2_future = loop.run_in_executor(executor, read_file_ultrafast, content2, filename2, sheet2)
        df1, df2 = await asyncio.gather(df1_future, df2_future)
    
    return df1, df2

def get_sheet_names(file_content: bytes, filename: str) -> List[str]:
    """Fast sheet name extraction"""
    try:
        if is_csv_file(filename):
            return ["Sheet1"]
        
        excel_file = io.BytesIO(file_content)
        engine = 'xlrd' if filename.lower().endswith('.xls') else 'openpyxl'
        excel_data = pd.ExcelFile(excel_file, engine=engine)
        return excel_data.sheet_names
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading sheets: {str(e)}")

def compare_dataframes_lightning(df1: pd.DataFrame, df2: pd.DataFrame, comparison_mode: str,
                                selected_columns: List[str], treat_null_as_zero: bool) -> dict:
    """Lightning-fast comparison"""
    import time
    start_time = time.time()
    
    logger.info(f"⚡ Starting comparison: {len(df1):,} × {len(df2):,} rows")
    
    if comparison_mode == "all":
        columns_to_compare = list(set(df1.columns) | set(df2.columns))
    else:
        columns_to_compare = selected_columns
    
    for col in columns_to_compare:
        if col not in df1.columns:
            df1[col] = ""
        if col not in df2.columns:
            df2[col] = ""
    
    df1 = df1[columns_to_compare]
    df2 = df2[columns_to_compare]
    
    max_rows = max(len(df1), len(df2))
    if len(df1) < max_rows:
        df1 = pd.concat([df1, pd.DataFrame("", index=range(len(df1), max_rows), columns=df1.columns)], ignore_index=True)
    if len(df2) < max_rows:
        df2 = pd.concat([df2, pd.DataFrame("", index=range(len(df2), max_rows), columns=df2.columns)], ignore_index=True)
    
    arr1 = np.char.strip(df1.astype(str).values.astype(str))
    arr2 = np.char.strip(df2.astype(str).values.astype(str))
    
    if treat_null_as_zero:
        null_vals = ["NULL", "[NULL]", "null", "0", ""]
        for nv in null_vals:
            arr1[arr1 == nv] = '__NULL__'
            arr2[arr2 == nv] = '__NULL__'
    
    comparison_mask = (arr1 != arr2)
    mismatch_indices = np.argwhere(comparison_mask)
    
    mismatches = []
    column_counts = {}
    col_names = df1.columns.tolist()
    df1_vals = df1.values
    df2_vals = df2.values
    
    for row_idx, col_idx in mismatch_indices:
        col_name = col_names[col_idx]
        mismatches.append({
            "row": int(row_idx),
            "col": int(col_idx),
            "col_name": col_name,
            "value1": clean_value(df1_vals[row_idx, col_idx]),
            "value2": clean_value(df2_vals[row_idx, col_idx])
        })
        column_counts[col_name] = column_counts.get(col_name, 0) + 1
    
    logger.info(f"🚀 Comparison complete: {time.time() - start_time:.2f}s")
    
    return {
        "mismatches": mismatches,
        "total_mismatches": len(mismatches),
        "columns_affected": len(column_counts),
        "total_rows": max_rows,
        "affected_columns": column_counts
    }

def dataframe_to_list_fast(df: pd.DataFrame, max_rows: int = None) -> List[List]:
    """Fast DataFrame to list conversion"""
    if max_rows:
        df = df.head(max_rows)
    result = df.replace([np.inf, -np.inf, np.nan], "").values.tolist()
    return result

# ============== PDF ENDPOINTS ==============

@app.post("/api/pdf/extract")
async def extract_pdf(file: UploadFile = File(...)):
    """Extract content from PDF"""
    try:
        if not file.filename or not is_pdf_file(file.filename):
            raise HTTPException(status_code=400, detail="Invalid file format. Please upload a PDF.")
        
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")
        
        extracted_data = extract_pdf_content(content)
        
        return {
            "success": True,
            "filename": file.filename,
            "page_count": extracted_data["page_count"],
            "tables_found": len(extracted_data["tables"]),
            "text_preview": extracted_data["text"][:500] if extracted_data["text"] else "",
            "extraction_method": extracted_data.get("extraction_method", "unknown"),
            "tables": extracted_data["tables"][:5]  # Limit tables in response
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF extraction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pdf/compare")
async def compare_pdf_excel(
    pdf_file: UploadFile = File(...),
    excel_file: UploadFile = File(...),
    user_instruction: str = Form(...),
    sheet_name: Optional[str] = Form(None)
):
    """AI-powered PDF to Excel comparison"""
    try:
        logger.info(f"🤖 AI Compare: {pdf_file.filename} vs {excel_file.filename}")
        
        # Validate files
        if not is_pdf_file(pdf_file.filename):
            raise HTTPException(status_code=400, detail="First file must be a PDF")
        
        if not (is_excel_file(excel_file.filename) or is_csv_file(excel_file.filename)):
            raise HTTPException(status_code=400, detail="Second file must be Excel or CSV")
        
        # Read files
        pdf_content = await pdf_file.read()
        excel_content = await excel_file.read()
        
        if not pdf_content or not excel_content:
            raise HTTPException(status_code=400, detail="Empty files")
        
        # Extract PDF data
        pdf_data = extract_pdf_content(pdf_content)
        
        # Read Excel data
        excel_df = read_file_ultrafast(
            excel_content, 
            excel_file.filename, 
            sheet_name if not is_csv_file(excel_file.filename) else None
        )
        
        # AI comparison
        comparison_result = await ai_compare_pdf_excel(pdf_data, excel_df, user_instruction)
        
        # Add metadata
        comparison_result["metadata"] = {
            "pdf_filename": pdf_file.filename,
            "excel_filename": excel_file.filename,
            "pdf_pages": pdf_data["page_count"],
            "pdf_tables": len(pdf_data["tables"]),
            "excel_rows": len(excel_df),
            "excel_columns": len(excel_df.columns),
            "user_instruction": user_instruction,
            "extraction_method": pdf_data.get("extraction_method", "unknown")
        }
        
        logger.info("✅ AI comparison complete")
        return comparison_result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ PDF comparison error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ============== EXCEL ENDPOINTS ==============

@app.get("/")
async def root():
    return {
        "message": "Excel & PDF Comparison API with AI",
        "features": ["Excel vs Excel", "PDF vs Excel (AI-powered)", "Multi-sheet support"],
        "gemini_configured": bool(GEMINI_API_KEY),
        "version": "2.0"
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "2.0-with-ai",
        "gemini_configured": bool(GEMINI_API_KEY)
    }

@app.post("/api/upload/sheets")
async def get_sheets(file: UploadFile = File(...)):
    """Get sheet names"""
    try:
        if not file.filename or not (is_csv_file(file.filename) or is_excel_file(file.filename)):
            raise HTTPException(status_code=400, detail="Invalid file format")
        
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")
        
        sheets = get_sheet_names(content, file.filename)
        return {"sheets": sheets}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/preview")
async def preview_data(
    file: UploadFile = File(...),
    sheet_name: Optional[str] = Form(None),
    max_rows: int = Form(100)
):
    """Preview data"""
    try:
        if not file.filename or not (is_csv_file(file.filename) or is_excel_file(file.filename)):
            raise HTTPException(status_code=400, detail="Invalid file format")
        
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")
        
        df = read_file_ultrafast(content, file.filename, sheet_name if not is_csv_file(file.filename) else None)
        
        preview_data = dataframe_to_list_fast(df, max_rows)
        headers = df.columns.tolist()
        
        return {
            "headers": headers,
            "data": preview_data,
            "total_rows": len(df),
            "total_columns": len(headers)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Preview error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
    """Standard Excel comparison"""
    try:
        logger.info(f"🔥 COMPARE: {file1.filename} vs {file2.filename}")
        
        if not file1.filename or not file2.filename:
            raise HTTPException(status_code=400, detail="Both files required")
        
        selected_cols = json.loads(selected_columns) if selected_columns != "[]" else []
        
        content1, content2 = await asyncio.gather(file1.read(), file2.read())
        
        if not content1 or not content2:
            raise HTTPException(status_code=400, detail="Empty files")
        
        df1, df2 = await read_files_parallel(
            content1, file1.filename, sheet_name1 if not is_csv_file(file1.filename) else None,
            content2, file2.filename, sheet_name2 if not is_csv_file(file2.filename) else None
        )
        
        result = compare_dataframes_lightning(df1, df2, comparison_mode, selected_cols, treat_null_as_zero)
        
        result.update({
            "file1_rows": len(df1),
            "file2_rows": len(df2),
            "file1_columns": len(df1.columns),
            "file2_columns": len(df2.columns),
            "columns1": df1.columns.tolist(),
            "columns2": df2.columns.tolist(),
            "data1_sample": dataframe_to_list_fast(df1, 1000),
            "data2_sample": dataframe_to_list_fast(df2, 1000),
            "headers1": df1.columns.tolist(),
            "headers2": df2.columns.tolist()
        })
        
        logger.info(f"✅ DONE: {result['total_mismatches']:,} mismatches")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Comparison error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/compare/large")
async def compare_excel_large(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    comparison_mode: str = Form("all"),
    selected_columns: str = Form("[]"),
    treat_null_as_zero: bool = Form(False),
    sheet_name1: Optional[str] = Form(None),
    sheet_name2: Optional[str] = Form(None)
):
    """Large file comparison"""
    return await compare_excel(
        file1, file2, comparison_mode, selected_columns, 
        treat_null_as_zero, sheet_name1, sheet_name2
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=1)