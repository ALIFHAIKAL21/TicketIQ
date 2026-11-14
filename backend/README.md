# TicketIQ Backend

NestJS HTTP API for the TicketIQ project.

## Current status

The backend is at the initial NestJS scaffold stage. `GET /` returns `Hello World!`. Database and FastAPI ML service integration have not been implemented yet.

## Setup

Run these commands from the `backend` directory:

```powershell
npm install
```

## Run locally

```powershell
npm run start:dev
```

The development server watches for code changes and listens on port `3000` by default.

## Verification

```powershell
npm run build
npm test
npm run test:e2e
```
