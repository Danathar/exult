# .github is gitignored upstream

**Date:** 2026-10-18
**Wrong:** creating `.github/...` files and running `git add .` or `git add -A`,
then wondering why they are not in the commit.
**Right:** `.gitignore` contains the entry `.github`. Already tracked files
there (the workflows) are fine, but a new file needs `git add -f <path>`. Check
with `git status --ignored --short` before committing. Do not edit `.gitignore`
to work around it.
**Why it matters:** workflows, templates or prompts silently missing from a PR.
**Evidence:** `.gitignore`, entry `.github`; `git check-ignore -v .github/new-file.md` (use an untracked path; already
tracked files are not reported as ignored).
