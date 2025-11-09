# Data Architecture - How Data Flows

## Overview

The system uses a **hybrid storage approach**:
- **PostgreSQL** for structured, queryable metadata
- **File system** for actual PDF and text content

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    SCRAPING PROCESS                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ↓
        ┌──────────────────────────────────────┐
        │  Baltimore Housing Website           │
        │  (cels.baltimorehousing.org)        │
        └──────────────────────────────────────┘
                           │
                           ↓
        ┌──────────────────────────────────────┐
        │  Python Scraper                      │
        │  baltimore_violations_scraper.py     │
        └──────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                ↓                     ↓
    ┌───────────────────┐    ┌──────────────────┐
    │   FILE SYSTEM     │    │   POSTGRESQL     │
    │   backend-app/    │    │   DATABASE       │
    │   data/           │    │   violations     │
    └───────────────────┘    └──────────────────┘
                │                     │
                └──────────┬──────────┘
                           ↓
        ┌──────────────────────────────────────┐
        │  Next.js Frontend                    │
        │  - Web UI                            │
        │  - API Routes                        │
        └──────────────────────────────────────┘
```

## What Gets Stored Where

### 📁 File System (`backend-app/data/`)

**Purpose**: Store actual files (PDFs, extracted text, etc.)

```
data/
├── pdf/
│   └── ARMISTEAD GARDENS/
│       ├── 2582832A.pdf          ← Actual PDF file
│       └── 2582889A.pdf
├── text/
│   └── ARMISTEAD GARDENS/
│       ├── 2582832A.txt          ← Extracted text
│       └── 2582889A.txt
├── json/
│   └── ARMISTEAD GARDENS/
│       ├── 2582832A.json         ← Metadata + extracted fields
│       └── 2582889A.json
├── ocr/
│   └── ARMISTEAD GARDENS/        ← OCR'd PDFs (if text layer missing)
├── logs/
│   └── scrape-<job-id>.log       ← Scrape job logs
└── violations.csv                ← Backup/audit trail
```

**Why?**
- PDFs can be large (50-500KB each)
- Storing binary files in database is inefficient
- File system is faster for serving static content
- Easy to backup/archive
- Can be served via CDN later

### 🗄️ PostgreSQL Database

**Purpose**: Store searchable, queryable metadata

```sql
violations (
  notice_number    TEXT PRIMARY KEY,    -- e.g., "2582832A"
  address          TEXT NOT NULL,        -- e.g., "5222 HORNERS"
  type             TEXT NOT NULL,        -- e.g., "Exterior"
  district         TEXT,                 -- e.g., "NORTHEAST"
  neighborhood     TEXT NOT NULL,        -- e.g., "ARMISTEAD GARDENS"
  date_notice      TIMESTAMP NOT NULL,   -- e.g., "2025-10-23"
  pdf_url          TEXT,                 -- e.g., "/violations/pdf/ARMISTEAD GARDENS/2582832A.pdf"
  text_url         TEXT,                 -- e.g., "/violations/text/ARMISTEAD GARDENS/2582832A.txt"
  created_at       TIMESTAMP,
  updated_at       TIMESTAMP
)
```

**Why?**
- Fast queries (search by address, date, neighborhood)
- Indexing for performance
- ACID transactions
- Relationships (could add users, comments, etc.)
- Real-time updates visible in UI

## How PDFs Are Served

### The Problem
PDFs are stored in `backend-app/data/pdf/` but Next.js runs from `frontend-app/`

### The Solution
API route serves files from the backend data directory:

```
User clicks "Open" → /violations/pdf/ARMISTEAD%20GARDENS/2582832A.pdf
                  ↓
Next.js API Route (src/app/api/violations/[...path]/route.ts)
                  ↓
Reads file from backend-app/data/pdf/ARMISTEAD GARDENS/2582832A.pdf
                  ↓
Returns PDF with correct Content-Type header
                  ↓
Browser displays PDF
```

**Benefits:**
- ✅ Secure (validates path doesn't escape data directory)
- ✅ Proper content types (PDF, text, JSON, CSV)
- ✅ Cache headers for performance
- ✅ Works in development and production

## Data Redundancy - Is it Wasteful?

**No! Each storage serves a purpose:**

### CSV File
- **Purpose**: Backup, audit trail, easy inspection
- **Size**: ~1KB per 10 violations
- **When to use**: Quick checks, Excel analysis, data recovery

### JSON Files
- **Purpose**: Rich metadata, extracted fields, debugging
- **Size**: ~500 bytes each
- **When to use**: Advanced analysis, ML training data

### PostgreSQL
- **Purpose**: Live application data, queries, relationships
- **Size**: ~200 bytes per row (just metadata, not files)
- **When to use**: Web UI, API queries, real-time searches

**Total overhead**: Minimal! CSV + JSON = ~1.5KB per violation
**Total benefit**: Maximum! Flexibility, redundancy, performance

## Production Deployment

### Option 1: Co-located (Current Setup)
```
server/
├── frontend-app/          (Next.js)
└── backend-app/
    └── data/              (PDFs, served via API route)
```

**Pros**: Simple, low latency
**Cons**: Single point of failure

### Option 2: Separate Static Files
```
app-server/
└── frontend-app/          (Next.js + PostgreSQL)

file-server/
└── data/                  (PDFs, served via nginx/CDN)
```

**Pros**: Better scalability, CDN cacheable
**Cons**: More complex deployment

### Option 3: Object Storage (S3/Spaces)
```
app-server/
└── frontend-app/          (Next.js + PostgreSQL)

cloud/
└── S3 bucket/             (PDFs, served via CloudFront)
```

**Pros**: Unlimited scale, automatic backups, global CDN
**Cons**: Requires scraper modification to upload to S3

## Future Enhancements

### 1. Move PDFs to S3/Spaces
Modify scraper to upload PDFs to object storage after download:

```python
# After downloading PDF
await upload_to_s3(pdf_path, f"violations/{neighborhood}/{notice}.pdf")
pdf_url = f"https://cdn.example.com/violations/{neighborhood}/{notice}.pdf"
```

### 2. Add PDF Processing
- Extract more fields (violation codes, inspector names)
- Generate thumbnails
- Full-text search via PostgreSQL full-text search

### 3. Remove CSV (Optional)
Once database is stable, CSV becomes redundant. Keep JSON for rich metadata.

### 4. Add Caching
Cache frequently accessed PDFs in Redis or CloudFront CDN.

## Summary

**Question**: Should data be in database or files?

**Answer**: Both!
- **Database**: Metadata for querying (notice #, date, address, etc.)
- **Files**: Actual content (PDFs, extracted text)
- **CSV**: Backup/audit trail

This is the **correct architecture** for a production scraping system. You get:
- ✅ Fast queries (database)
- ✅ Efficient file serving (file system)
- ✅ Data redundancy (CSV backup)
- ✅ Future flexibility (can migrate to S3 later)

**Your system is properly architected!** 🎉

