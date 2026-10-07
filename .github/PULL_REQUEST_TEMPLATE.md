<!-- Thanks for the pull request. Keep it focused on one thing. -->

## What and why

<!--
What changes, and which problem it solves. Link the issue if there is one:
"Closes #12". Explain the reason, not the diff.
-->

## How it was tested

<!--
The commands you ran and what they printed. If a test was not needed, say why.
Screenshots help a lot for anything visible in the browser.
-->

## Checklist

- [ ] The code, the comments and the commit messages are in English
- [ ] The documentation is updated, and the English/Hungarian pair stays in sync
- [ ] `npm run lint` and `npm run format:check` are clean
- [ ] `npm test` passes
- [ ] `npm run e2e` passes, or the change cannot affect it and that is said above
- [ ] The commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, …)
- [ ] No secret, token, `.env` value or `:latest` image tag is added
- [ ] The container hardening (read-only rootfs, dropped capabilities, `internal`
      networks) is kept, or the relaxation is explained above
