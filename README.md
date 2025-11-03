# 🧩 Tab Comparer

Compare two Excel sheets or pasted datasets instantly and visually identify mismatched values — all in your browser. Built with Next.js, this lightweight tool makes spreadsheet comparison simple, accurate, and intuitive.

## ✨ Features

* 📂 Upload or paste two Excel datasets side by side
* 🔍 Compare values column by column and row by row
* 🎨 Automatically highlight mismatched cells
* 🧭 Displays column names and row numbers for differences
* ⚡ Fast, client-side comparison — no backend required
* 🪶 Clean, responsive, and user-friendly interface

## 🖥️ How It Works

1. Upload or paste your first dataset (reference Excel data).
2. Upload or paste your second dataset (the one to compare).
3. Click **Compare Data**.
4. The app:
   * Reads both datasets.
   * Matches data based on column headers.
   * Highlights mismatched values with color cues.
5. Instantly view mismatches directly on-screen.

## 🗂️ Project Structure
```
tab-comparer/
├── public/
│   ├── favicon.ico
│   ├── placeholder.svg
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── ui/
│   │   ├── ComparisonResults.tsx
│   │   └── FileInput.tsx
│   ├── hooks/
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   ├── lib/
│   │   └── utils.ts
│   └── pages/
│       ├── Index.tsx
│       └── NotFound.tsx
├── package.json
└── README.md
```

## ⚙️ Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/HasibNirjhar07/tab-comparer.git
cd tab-comparer
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run the development server
```bash
npm run dev
```

### 4. Open your browser and visit 👉 http://localhost:3000

## 🧠 Comparison Logic

* Parses both Excel files as JSON objects.
* Compares values by matching column headers.
* Ignores case and spacing differences by default.
* Highlights mismatched cells in the comparison table.
* Displays a summary of total mismatches and affected columns.

## 🧾 Example

| Column | Row | Expected | Found |
|--------|-----|----------|-------|
| Name   | 3   | John     | Jon   |
| Age    | 5   | 25       | 26    |

Mismatched cells appear highlighted in red or orange.

## 🧩 Future Enhancements

* Download comparison results as Excel
* Add strict (case-sensitive) comparison mode
* Support CSV upload
* Show side-by-side diff viewer

## 👨‍💻 Author

**Hasibul Islam Nirjhar**  
📍 Islamic University of Technology  
💻 Software Engineering | AI | Web Development  
📧 hasibnirjhar07@gmail.com  
🌐 GitHub: [@HasibNirjhar07](https://github.com/HasibNirjhar07)

## 🪪 License

This project is open source and available under the MIT License.
