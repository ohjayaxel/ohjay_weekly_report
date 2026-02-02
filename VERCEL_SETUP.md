# Vercel Deployment Guide

## Översikt
Detta projekt består av två delar:
- **Frontend**: Next.js-app som deployas på Vercel
- **Backend**: FastAPI-server som behöver deployas separat (t.ex. Railway, Render, eller liknande)

## Rekommenderad setup (framtidssäkrad)
**Root Directory = `frontend`** är den rekommenderade och framtidssäkrade konfigurationen. Då bygger Vercel direkt från `frontend/` (där `package.json` och Next.js finns), vilket är Vercels standard för monorepos och undviker fel som "No Next.js version detected".

---

## Steg 1: Förbered projektet

### 1.1 Kontrollera att frontend kan byggas
```bash
cd frontend
npm install
npm run build
```

Om bygget lyckas är du redo för Vercel!

## Steg 2: Deploya till Vercel

### 2.1 Via Vercel Dashboard (Rekommenderat)
1. Gå till [vercel.com](https://vercel.com) och logga in
2. Klicka på "Add New Project"
3. Importera ditt GitHub-repository (t.ex. `ohjayaxel/ohjay_weekly_report`)
4. **Viktigt:** Sätt **Root Directory** till `frontend` innan du deployar

### 2.2 Konfigurera Build Settings (krävs)
I Vercel → Project Settings → General → Root Directory:
- **Root Directory**: `frontend` **(obligatoriskt – annars får du "No Next.js version detected")**
- **Framework Preset**: Next.js
- **Build Command**: `npm run build` (default)
- **Install Command**: `npm install` (default)
- **Output Directory**: `.next` (default)

Säkerställ att Root Directory är `frontend` så att Vercel använder `frontend/package.json` och `frontend/vercel.json`.

### 2.3 Miljövariabler i Vercel
Lägg till följande miljövariabler i Vercel Dashboard → Project Settings → Environment Variables:

#### Obligatoriska:
```
NEXT_PUBLIC_API_URL=https://din-backend-url.com
NEXT_PUBLIC_SUPABASE_URL=https://ditt-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ditt_anon_key_här
```

#### Valfria (för development):
```
NEXT_PUBLIC_API_URL=http://localhost:8000  # Endast för local dev
```

**Viktigt**: 
- `NEXT_PUBLIC_*` variabler är tillgängliga i frontend-koden
- Lägg till samma variabler för Production, Preview och Development miljöer

## Steg 3: Backend Deployment

Backend (FastAPI) behöver deployas separat. Alternativ:

### Alternativ 1: Railway (Rekommenderat)
1. Skapa konto på [railway.app](https://railway.app)
2. Skapa nytt projekt från GitHub-repo
3. Sätt Root Directory till projektets root (inte frontend)
4. Lägg till miljövariabler:
   ```
   SUPABASE_URL=https://ditt-supabase-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=ditt_service_role_key
   ```
5. Sätt start command: `python3 -m uvicorn weekly_report.api.routes:app --host 0.0.0.0 --port $PORT`

### Alternativ 2: Render
1. Skapa konto på [render.com](https://render.com)
2. Skapa ny Web Service från GitHub-repo
3. Sätt:
   - **Build Command**: `pip install -r requirements.txt` (om du har en)
   - **Start Command**: `uvicorn weekly_report.api.routes:app --host 0.0.0.0 --port $PORT`
4. Lägg till miljövariabler (samma som ovan)

### Alternativ 3: Vercel Serverless Functions
Om du vill ha allt på Vercel, kan du konvertera backend till Vercel Serverless Functions, men det kräver mer arbete.

## Steg 4: Uppdatera API URL

Efter att backend är deployad:
1. Kopiera backend-URL:en (t.ex. `https://your-app.railway.app`)
2. Uppdatera `NEXT_PUBLIC_API_URL` i Vercel Environment Variables
3. Redeploya frontend

## Steg 5: Verifiera Deployment

1. Öppna din Vercel-URL (t.ex. `https://your-app.vercel.app`)
2. Öppna Developer Console (F12)
3. Kontrollera att:
   - Inga CORS-fel visas
   - API-anrop fungerar
   - Supabase-anslutning fungerar

## Felsökning

### Problem: "Module not found" vid build
**Lösning**: Kontrollera att Root Directory är satt till `frontend` i Vercel

### Problem: API-anrop misslyckas
**Lösning**: 
- Kontrollera att `NEXT_PUBLIC_API_URL` är korrekt satt
- Kontrollera CORS-inställningar i backend
- Kontrollera att backend är tillgänglig

### Problem: Supabase fungerar inte
**Lösning**:
- Kontrollera att `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` är korrekta
- Kontrollera RLS (Row Level Security) policies i Supabase

### Problem: Build tar för lång tid
**Lösning**: 
- Överväg att använda Vercel's Build Cache
- Kontrollera att `node_modules` inte committas till git

## Ytterligare optimeringar

### Edge Functions (Valfritt)
Om du vill ha snabbare API-anrop, kan du skapa Vercel Edge Functions som proxy till backend.

### CDN Caching
Vercel cachar automatiskt statiska assets. För API-anrop, överväg att lägga till cache headers i backend.

## Checklista före deployment

- [ ] Frontend bygger lokalt (`npm run build` i frontend-mappen)
- [ ] Alla miljövariabler är dokumenterade
- [ ] Backend är deployad och tillgänglig
- [ ] CORS är konfigurerat i backend för Vercel-domänen
- [ ] Supabase-tabeller är skapade
- [ ] Git repository är uppdaterat

## Support

Om du stöter på problem:
1. Kontrollera Vercel Build Logs
2. Kontrollera Browser Console för fel
3. Kontrollera Network tab för misslyckade requests
