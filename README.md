# CityScope

A geospatial web application for exploring Berlin's urban infrastructure through interactive map visualizations. Built with React, TypeScript, Mapbox GL JS, and Material UI.

<!-- ![CityScope Screenshot](screenshot.png) -->

## Features

- **Interactive Map** — Full-screen Mapbox GL map centered on Berlin with dark theme
- **Layer Toggling** — Toggle visibility of roads, buildings, and district boundaries from the sidebar
- **Berlin Districts** — View boundaries of all 12 Berlin Bezirke with GeoJSON overlay
- **Dark UI** — Material UI dark theme with responsive sidebar and navbar

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 8 |
| Map | Mapbox GL JS 3 |
| UI | Material UI 7 |
| State | Zustand 5 |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Mapbox](https://www.mapbox.com/) account with an access token

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/cityscope.git
cd cityscope/cityscope

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
```

Edit `.env.local` and add your Mapbox access token:

```
VITE_MAPBOX_TOKEN=pk.your_mapbox_token_here
```

You can get a free token at [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/).

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
npm run preview
```

## Project Structure

```
cityscope-app/
├── cityscope/                # Frontend
│   ├── src/
│   │   ├── components/       # MapView, Navbar, Sidebar
│   │   ├── store/            # Zustand stores
│   │   ├── constants/        # Layer config
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── theme.ts
│   └── public/
│       └── data/             # GeoJSON files
└── cityscope-backend/        # Backend (coming in Phase 5)
```

## Roadmap

- [x] Phase 1 — Map Shell
- [x] Phase 2 — Layer Toggling
- [ ] Phase 3 — Feature Click Panel
- [ ] Phase 4 — 3D Building Extrusion
- [ ] Phase 5 — Node + PostGIS Backend
- [ ] Phase 6 — Heatmap Overlay (Deck.gl)

## License

MIT
