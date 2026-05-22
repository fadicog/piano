# Piano Quest

A tablet-friendly piano practice game for MTB Level 3 pieces:

- Innocence
- Game of Patience
- Rondo
- Romance

The app is static and can be hosted on GitHub Pages. It also works as an installable PWA on Android Chrome after the first load.

## GitHub Sync

Progress is saved locally by default. To sync between devices, open **Cloud Sync**, enter a fine-grained GitHub token with **Contents: Read and write** access to `fadicog/piano`, and press sync.

The app merges practice sessions by unique session ID into:

```text
data/progress.json
```

Do not hard-code the token into the app. Each browser stores its own token locally.
