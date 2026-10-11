# can_delete/

Scratch archive from the first builds of the app, when it was still called
Quiet Zone. Nothing in the app, tests, builds or docs uses these files, so
the whole folder can be deleted whenever it is no longer wanted. ESLint
ignores it (`eslint.config.mjs`).

What is left:

- `screenshots/`: early QA screenshots (desktop and mobile, dev preview and
  built output) with the JSON verdicts from the browser smoke check, plus
  `qr-styled.png`.
- `.studio/`: the preview server log and workspace status file from that
  session (kept for reference; `.gitignore` re-includes these logs).

Removed in October 2026: the old `QR_Generator.zip` project download (the
current snapshot is `archive/QR-Zone.zip`, kept in the repo but no longer
published on the site), an old Vercel build output snapshot,
and a leftover copy of an unused install-page logo (`public/__studio/...`).
