# 🌳 FAMILY-CHART-

An interactive family tree app — works entirely in the browser, no server needed.

## Features

- Add, edit, and delete family members
- Multi-family support — create separate families and switch between them
- Relationship mapping (parent/child/spouse/sibling)
- Search, filter by alive/deceased, and filter by location
- Export to PDF or PNG (with or without female members)
- Save your data baked into the HTML for GitHub visitors
- Import / Export JSON backups
- Undo / Redo support
- Auto-save every 30 seconds

## Live Demo

Once deployed to GitHub Pages, your family tree is accessible at:

```
https://<your-username>.github.io/FAMILY-CHART-/
```

## How to use

### 1. Add your data in the app

Open `index.html` in your browser. Add members, build relationships, and set up your families.

### 2. Save for GitHub

Click the **📦 GitHub** button in the toolbar. This downloads a new `index.html` with your data baked in — so anyone who opens the page sees your tree without needing localStorage.

### 3. Upload to this repo

Replace `index.html` in this repo with the downloaded file. Commit and push to `main`.

### 4. Enable GitHub Pages

In your repo settings → **Pages** → Source: **GitHub Actions**. The workflow will deploy automatically on every push.

## Local use

Just open `index.html` directly in any modern browser. No build step, no install needed.
