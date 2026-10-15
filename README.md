# Disk Space Indicator

GNOME Shell 46 extension that shows how full each mounted partition is in the top bar:

```
/ ▮ 60%   games ▮ 70%   data ▮ 16%
```

- Each mini bar is green below 80%, yellow from 80%, red from 90%.
- Click it for used / total / free per partition, plus shortcuts to Disk Usage Analyzer and Disks.
- Partitions are detected automatically from `/proc/self/mounts`: local `/dev/*` partitions of 1 GB or more.
  Snaps, FUSE mounts (pCloud, AppImages), network shares and optical media are skipped.
- Refreshes every 30 seconds and each time the menu opens. All reads are asynchronous.

## Install

```bash
scripts/install.sh
```

It symlinks this folder to `~/.local/share/gnome-shell/extensions/disk-space-indicator@abdelali` and enables it.
The first time, restart GNOME Shell so it sees the new folder (X11: Alt+F2, `r`, Enter; Wayland: log out and in).
After editing the code later, restart the shell the same way to reload it.

## Tests

```bash
gjs -m tests/lib.test.js
```

`lib.js` holds the pure logic (mount filtering, percentages, formatting) and has no GNOME imports, so it runs under plain `gjs`.

## Logs

```bash
journalctl --user -b -g disk-space-indicator
```
