# ASTANA 2040 — AI CITY BRAIN

Interactive Smart City Digital Twin & Multi-Agent Urban Management Simulation built on real **OpenStreetMap** geographical data of **Astana, Kazakhstan**.

## Core AI Algorithms Implemented
1. **Intelligent Agents (Week 1):** Autonomous Vehicle Agents & Adaptive Traffic Light Agents following `PERCEIVE -> ANALYZE -> DECIDE -> ACT -> OBSERVE`.
2. **A* Search (Week 2):** Dynamic pathfinding (`f(n) = g(n) + h(n)`) with Haversine heuristic and real-time congestion, weather, and road closure costs over Astana street polylines.
3. **Constraint Satisfaction Problem — CSP (Week 3):** Backtracking solver with Minimum Remaining Values (MRV) and Forward Checking for municipal emergency response team allocation.
4. **Bayesian Network (Week 6):** Probabilistic inference using Noisy-OR & Conditional Probability Tables (CPT) to predict traffic congestion and emergency response delays.

## Run Locally
```bash
npm install
npm run dev
```

## Deploy to GitHub Pages
1. Push this repository to GitHub.
2. Go to **Settings -> Pages** or use GitHub Actions (`npm run build` outputs to `dist/`).
