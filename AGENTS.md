# TV Industry IL - Project Guide

## Overview
Israeli TV industry platform built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Firebase (Auth + Firestore + Storage), deployed on Vercel.

## Project Location
`C:\Users\User\Desktop\Codex\tv-industry-il`

## Key Commands
- `npm run dev` - Dev server on port 3000
- `npx next build` - Production build
- `npx vercel --prod --yes` - Deploy to Vercel production
- `git push origin master` - Push to GitHub

## Deployment
- **Live URL**: https://tv-industry-il.vercel.app
- **GitHub**: https://github.com/Shimesh/tv-industry-il (branch: master)
- **Vercel account**: yaron-orbachs-projects
- **Firebase project**: tv-industry-il

## Architecture
- **Auth**: Firebase Auth (Google sign-in with popup + redirect fallback)
- **Database**: Firebase Firestore (user profiles, chat, board posts)
- **Storage**: Firebase Storage (avatars, board images)
- **Env vars**: `.env.local` (6 NEXT_PUBLIC_FIREBASE_* vars) - also set in Vercel

## Critical Files
- `src/lib/firebase.ts` - Firebase initialization with explicit browserLocalPersistence
- `src/contexts/AuthContext.tsx` - Auth state management with fetchOrCreateProfile (resilient to Firestore errors)
- `src/components/AuthGuard.tsx` - Guards auth-required routes
- `src/app/login/page.tsx` - Login/register page with Google sign-in
- `src/components/Navigation.tsx` - Navbar with user menu

## Key Patterns
- All Firestore operations in auth flow are wrapped in try-catch (Firestore failures must never break auth)
- signInWithGoogle: popup first, redirect fallback ONLY for popup-specific error codes (not Firestore errors)
- Auth state persists via browserLocalPersistence (IndexedDB)
- `.npmrc` has `legacy-peer-deps=true` for Vercel build compatibility
- `.nvmrc` sets Node 20 for Vercel

## User
- Hebrew-speaking user (all UI is in Hebrew, RTL)
- Prefers direct action over long explanations
- Uses "תמשיך" (continue) frequently
