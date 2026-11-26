# GitHub Setup Guide

This guide puts the project on GitHub as a **private** repository. Do not make the repository public: it contains business logic and the database schema. Secrets must never be committed.

---

## 1. Create a GitHub account (if you do not have one)

1. Go to https://github.com/signup and create an account. Verify your email.
2. Turn on two-factor authentication in **Settings → Password and authentication**.

---

## 2. Create a private repository

1. Click **+** (top right) → **New repository**.
2. **Repository name:** `zentro-buildmart`.
3. **Visibility:** select **Private**.
4. Do **not** tick "Add a README", ".gitignore" or "license" (the project already has them).
5. Click **Create repository**. Keep the page open; you need its address (`https://github.com/<your-user>/zentro-buildmart.git`).

---

## 3. Open the project in VS Code

Follow Step 2 of the Local Setup Guide. The folder you open must be the project root (the folder containing `package.json`).

---

## 4. Initialise Git

Open the VS Code terminal (PowerShell) in the project root:

```powershell
git init
git branch -M main
```

---

## 5. Check .gitignore

Open `.gitignore` in VS Code. It must contain these lines (they are already present in this package):

```
node_modules/
.next/
.env
.env.*
!.env.example
```

Confirm that `.env.local` is excluded:

```powershell
git check-ignore -v .env.local
```

Expected output: a line showing `.gitignore` and the `.env.*` rule. If nothing is printed, stop and do not continue; ask for help before adding files.

---

## 6. Add files and review them

```powershell
git add .
git status
```

Read the `git status` list carefully. **It must not contain** `.env.local`, `node_modules`, `.next` or any file containing a real key. It should contain `.env.example`, `package.json`, `package-lock.json` (if you ran `npm install`), `app/`, `lib/`, `supabase/`, `docs/` and the other source files.

If a secret file appears, remove it from staging before committing:

```powershell
git rm --cached .env.local
```

---

## 7. Create the initial commit

```powershell
git config user.name "Your Name"
git config user.email "you@example.com"
git commit -m "Initial commit: ZENTRO BuildMart"
```

Use the email address linked to your GitHub account.

---

## 8. Add the remote and push

```powershell
git remote add origin https://github.com/<your-user>/zentro-buildmart.git
git push -u origin main
```

**Authentication.** GitHub no longer accepts account passwords for Git. When Git asks for credentials:

- Use **Git Credential Manager** (installed with Git for Windows): a browser window opens; sign in and approve.
- Or create a **Personal Access Token** (GitHub → **Settings → Developer settings → Personal access tokens**). Use the token in place of the password.

**Common authentication errors**

| Message | Cause | Fix |
|---|---|---|
| `remote: Support for password authentication was removed` | You entered your password | Use Git Credential Manager or a token (above) |
| `fatal: Authentication failed` | Wrong or expired token | Create a new token and retry |
| `Permission to ... denied to <user>` | You are signed in as another GitHub user | Run `git config credential.helper` and sign out of the stored credential in Windows Credential Manager, then retry |
| `fatal: remote origin already exists` | Remote was added earlier | Run `git remote set-url origin <url>` |

---

## 9. Push future updates

After you change the project:

```powershell
git add .
git status
git commit -m "Describe the change briefly"
git push
```

Vercel redeploys automatically when you push to `main` (see the Vercel guide).

---

## 10. Protect the main branch (recommended)

On GitHub open **Settings → Branches → Add branch ruleset**, target `main`, and require a pull request before merging. This prevents an accidental direct push from triggering a production deployment.
