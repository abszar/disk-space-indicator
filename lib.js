// Pure helpers, no GI imports, so they can be tested with plain `gjs -m`.

const READ_ONLY_MEDIA = new Set(['squashfs', 'iso9660', 'udf', 'erofs']);

// /proc/mounts escapes spaces, tabs, newlines and backslashes as \ooo
function unescapeMountField(field) {
    return field.replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

// Real local partitions only: network shares, FUSE mounts (pCloud, AppImages),
// snaps and optical media are skipped, so the shell never stats something that can hang.
export function parseMounts(text) {
    const seen = new Set();
    const mounts = [];
    for (const line of text.split('\n')) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 3)
            continue;
        const [device, mountPoint, fsType] = fields;
        if (!device.startsWith('/dev/') || device.startsWith('/dev/loop'))
            continue;
        if (READ_ONLY_MEDIA.has(fsType) || seen.has(device))
            continue;
        seen.add(device);
        mounts.push({device, mountPoint: unescapeMountField(mountPoint)});
    }
    return mounts;
}

// Same rule as df: used / (used + available), rounded up; root-reserved blocks don't count.
export function usageFrom(size, free, used) {
    const usable = used + free;
    const percent = usable > 0 ? Math.ceil((used / usable) * 100) : 0;
    return {size, free, used, percent};
}

export function levelFor(percent) {
    if (percent >= 90)
        return 'critical';
    if (percent >= 80)
        return 'warn';
    return 'ok';
}

export function shortName(mountPoint) {
    if (mountPoint === '/')
        return '/';
    const parts = mountPoint.split('/').filter(p => p);
    return parts[parts.length - 1] ?? mountPoint;
}

// Decimal units, like GNOME Files and Disks.
export function formatBytes(bytes) {
    const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }
    const digits = value < 10 && unit > 0 ? 1 : 0;
    return `${value.toFixed(digits)} ${units[unit]}`;
}
