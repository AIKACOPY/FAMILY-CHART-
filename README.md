# 🌳 FamilyTree Pro — Interactive Genealogy App

A **fully functional, beautiful, interactive Family Tree & Genealogy Web Application** built with pure HTML, CSS, JavaScript, D3.js, and jsPDF. Works directly on GitHub Pages — no backend, npm, or setup required!

---

## ✨ Features

### 🌳 Dynamic Family Tree
- **D3.js-powered** interactive tree with zoom, pan, and drag
- Smooth animations and transitions
- Hierarchical top-down layout
- Colorful gender-coded cards (blue/pink/green)
- Generation badges on each card
- Root node pulsing animation
- Animated background particles

### 👤 Member Details
- Name, Date of Birth, Date of Death
- Gender (Male / Female / Other)
- Profile photo upload
- Spouse & Marriage date
- Biography / Notes
- Location (Country, State, City)
- Age calculation (auto)

### 🎨 Beautiful Cards
- Vibrant glassmorphism design
- Gender-colored gradients
- Avatar photos
- Location, age, deceased indicator
- Animated hover effects & tooltips

### 🖱️ Interactions
- **Click** → Select member (highlights)
- **Double-click** → Open full detail panel
- **Right-click** → Context menu with actions
- **Drag** → Reposition nodes on canvas

### 📋 Detail Panel
- Hero banner with blurred photo background
- Full personal info grid
- Children, siblings, spouse chips (clickable)
- Biography / notes section
- Life timeline
- Action buttons (Edit, Add Child, Sub-Tree, etc.)

### 👨‍👩‍👧 Family Management
- Create multiple families
- Rename families
- Delete families
- Switch between families instantly

### 🤝 Adoption System
- Mark child as adopted
- Set biological parents separately
- Dotted line = biological parent link
- Solid line = adoptive parent link

### 🔗 Relationship Detection
- Select any two members
- Instantly discover: siblings, cousins, uncle/aunt, grandparent, etc.
- Full BFS-based LCA algorithm

### 🔍 Search & Filter
- Live search by name or location
- Filter: All / Living / Deceased
- Sidebar member list with quick filter

### 📊 Statistics Panel
- Total members count
- Living vs deceased
- Number of generations
- Upcoming birthdays (next 30 days)

### 💾 Data Management
- Auto-save to browser localStorage
- Import/Export JSON (full data backup)
- Undo/Redo (50 levels, Ctrl+Z/Y)

### 📤 Export Options
- **JSON** — Full data backup/transfer
- **PNG** — Screenshot of the tree
- **PDF** — Member cards layout (jsPDF)
- **GitHub Ready** — Generates a data-loader HTML file

### 🌐 GitHub Pages Ready
- Zero backend required
- No npm/terminal setup
- Upload `index.html` → done!

---

## 🚀 Getting Started

### Option 1: GitHub Pages (Recommended)
1. Fork or upload `index.html` to a GitHub repository
2. Go to **Settings → Pages → Source: main branch**
3. Your app is live at `https://yourusername.github.io/yourrepo/`

### Option 2: Local (No Setup)
1. Download `index.html`
2. Open it in any modern browser
3. Done! ✅

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Add new member |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+F` | Focus search |
| `Escape` | Close panels/menus |

---

## 🖱️ Mouse Controls

| Action | Result |
|--------|--------|
| Click node | Select member |
| Double-click node | Open detail panel |
| Right-click node | Context menu |
| Drag node | Reposition |
| Scroll / Pinch | Zoom in/out |
| Drag canvas | Pan |

---

## 📁 File Structure

```
family-tree/
├── index.html      ← Complete self-contained app
├── style.css       ← Stylesheet (if separate)
├── script.js       ← JavaScript (if separate)
└── README.md       ← This file
```

> **Note:** The standalone `index.html` includes all CSS and JS inline — just one file needed!

---

## 🛠️ Technologies

| Library | Version | Purpose |
|---------|---------|---------|
| D3.js | v7.8.5 | Tree visualization, SVG, zoom/pan/drag |
| jsPDF | v2.5.1 | PDF export |
| Vanilla JS | ES6+ | App logic |
| CSS3 | — | Glassmorphism UI, animations |

---

## 📖 How to Use

### Adding Your First Member
1. Click **➕ Add Member** or **Load Sample Data** to start
2. Fill in the name, gender, dates, and location
3. Upload a photo (optional)
4. Click **Save Member**

### Building the Tree
1. Add the oldest generation first (grandparents)
2. Add parents, selecting their parents from the dropdown
3. Add children, selecting their parents
4. Add spouses — link them via the Spouse field

### Adoption
1. When adding a child, check **"This person is adopted"**
2. Set Parent 1/2 as the adoptive parents
3. Set Biological Parent 1/2 for the biological line
4. The tree will show dotted lines for biological connections

### Saving Your Data
- Data auto-saves in your browser
- For backup: **Export → Export JSON**
- To restore: **Export → Import JSON**
- For GitHub Pages: **Export → GitHub Ready**

---

## 🎨 Design

- **Dark glassmorphism** theme with purple/cyan/amber accents
- **Gender-coded cards**: Blue (Male), Pink (Female), Green (Other)
- **Animated particles** background
- **Smooth transitions** on all interactions
- **Responsive** — works on mobile and desktop

---

## 📜 License

MIT License — Free for personal and commercial use.

---

*Built with ❤️ — No backend required. Works everywhere.*
