# 🧩 Tab Comparer

Compare multiple Excel sheets, JSON, CSV datasets, and even PDFs instantly. Built with a modern React + Vite frontend and a blazing-fast Python FastAPI backend, this tool makes data comparison simple, accurate, and intelligent — featuring AI-powered PDF-to-Excel comparisons using Google Gemini!

## ✨ Key Features

* 📂 **Multi-Format Support:** Upload and compare Excel (`.xlsx`, `.xls`), CSV, JSON, and JSONL datasets side by side.
* 🤖 **AI-Powered PDF Comparison:** Compare PDF text/tables against Excel or CSV datasets intelligently using the Google Gemini AI.
* ⚡ **Blazing Fast Backend:** Ultra-fast bulk data reading and comparison using `pandas`, `numpy`, and `pyarrow`. Capable of comparing millions of rows of data in just a fraction of a second.
* 🧭 **Smart Flattening:** Automatically handles nested JSON structure normalization.
* 🎨 **Visual Highlighting:** Automatically highlight mismatched cells intuitively with row numbers and column names.
* 🪶 **Clean UI:** Responsive, user-friendly interface built with React, Tailwind CSS, and Shadcn UI.
* 🛠️ **CLI JSONL Comparator:** Includes a standalone python script `json_lcompare.py` for advanced CLI-based JSONL matching.

## 🖥️ How It Works

1. **Select Mode:** Choose between standard file comparison (Excel/CSV/JSON) or AI-Powered PDF vs Excel Comparison.
2. **Upload Datasets:** Upload your reference data and the data to compare.
3. **Compare Data**:
   * For structured data, the backend will lightning-fast match values column by column and highlight mismatches.
   * For the AI PDF tool, provide a user instruction. The backend extracts tables and text from the PDF, passes context to the Gemini AI, and intelligently returns matches, mismatches, and missing data summaries.

## 🗂️ Project Structure

```text
tab-comparer/
├── backend/                  # Python FastAPI Backend
│   ├── main.py               # API endpoints, Pandas reading & AI logic
│   ├── requirements.txt      # Python dependencies
│   └── .env                  # Backend environment variables
├── src/                      # React Frontend
│   ├── components/           # UI components (Shadcn + Core)
│   ├── pages/                # Application views/pages
│   ├── lib/                  # Utilities
│   └── App.tsx               # Main frontend routing
├── json_lcompare.py          # Standalone CLI tool for JSONL comparison
├── package.json              # Frontend dependencies
└── vite.config.ts            # Vite build config
```

## ⚙️ Installation & Setup

### Overview
This project requires running both the FastAPI backend and the Vite frontend concurrently.

### 1. Clone the repository
```bash
git clone https://github.com/HasibNirjhar07/tab-comparer.git
cd tab-comparer
```

### 2. Backend Setup
The backend handles data crunching and AI requests natively.
```bash
cd backend
python -m venv venv

# Activate Virtual Environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Environment Setup
# Create a .env file inside backend/ and add your Gemini API Key
echo GEMINI_API_KEY=your_google_gemini_api_key > .env

# Run the FastAPI server
uvicorn main:app --reload
# The backend runs on http://localhost:8000
```

### 3. Frontend Setup
Open a new terminal window at the project root.
```bash
# Install frontend packages
npm install

# Start the Vite development server
npm run dev
# The frontend runs on http://localhost:8080 (as defined in vite.config.ts)
```

## 🧠 Comparison Logic

* **Standard Comparison:** Pads mismatched datasets, harmonizes columns, handles nulls dynamically, and computes vectorized difference arrays.
* **AI Comparison:** Extracts PDF text and tables securely using `pdfplumber` and `PyPDF2`, injecting targeted context alongside formatted Excel previews directly into Google's Gemini LLMs.
* **Smart JSON Flattening:** Inspects the first few dataset records to dynamically normalize deeply nested lists.

## 👨‍💻 Author

**Hasibul Islam Nirjhar**  
📍 Islamic University of Technology  
💻 Software Engineering | AI | Web Development  
📧 hasibnirjhar07@gmail.com  
🌐 GitHub: [@HasibNirjhar07](https://github.com/HasibNirjhar07)

## 🪪 License

This project is open source and available under the MIT License.
