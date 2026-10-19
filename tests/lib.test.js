// Run with: gjs -m tests/lib.test.js
import System from 'system';
import {parseMounts, usageFrom, levelFor, shortName, formatBytes} from '../lib.js';

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        print(`ok   ${name}`);
    } else {
        failures++;
        print(`FAIL ${name}\n     expected ${e}\n     got      ${a}`);
    }
}

const MOUNTS = `/dev/nvme0n1p5 / ext4 rw,relatime 0 0
/dev/loop0 /snap/bare/5 squashfs ro,nodev,relatime 0 0
proc /proc proc rw 0 0
pCloud.fs /home/user/pCloudDrive fuse rw 0 0
Vicinae.AppImage /tmp/.mount_Vicina fuse.Vicinae.AppImage ro 0 0
/dev/nvme0n1p7 /mnt/games ext4 rw,relatime 0 0
/dev/nvme0n1p8 /mnt/data ext4 rw,relatime 0 0
/dev/nvme0n1p8 /srv/bind-of-data ext4 rw,relatime 0 0
/dev/nvme0n1p1 /boot/efi vfat rw,relatime 0 0
/dev/nvme0n1p3 /mnt/My\\040Windows fuseblk rw 0 0
//nas/share /mnt/nas cifs rw 0 0
/dev/sr0 /media/cdrom iso9660 ro 0 0
`;

check('parseMounts keeps local block-device filesystems, first mount per device',
    parseMounts(MOUNTS),
    [
        {device: '/dev/nvme0n1p5', mountPoint: '/'},
        {device: '/dev/nvme0n1p7', mountPoint: '/mnt/games'},
        {device: '/dev/nvme0n1p8', mountPoint: '/mnt/data'},
        {device: '/dev/nvme0n1p1', mountPoint: '/boot/efi'},
        {device: '/dev/nvme0n1p3', mountPoint: '/mnt/My Windows'},
    ]);
check('parseMounts ignores blank and malformed lines', parseMounts('\n\nbad line\n'), []);

// df semantics: percent = used / (used + available), reserved blocks excluded
check('usageFrom matches df', usageFrom(211e9, 82e9, 119e9),
    {size: 211e9, free: 82e9, used: 119e9, percent: 60});
check('usageFrom on empty filesystem', usageFrom(0, 0, 0),
    {size: 0, free: 0, used: 0, percent: 0});

check('levelFor 79 is ok', levelFor(79), 'ok');
check('levelFor 80 is warn', levelFor(80), 'warn');
check('levelFor 89 is warn', levelFor(89), 'warn');
check('levelFor 90 is critical', levelFor(90), 'critical');


check('shortName root', shortName('/'), '/');
check('shortName nested', shortName('/mnt/games'), 'games');
check('shortName trailing slash', shortName('/mnt/data/'), 'data');

check('formatBytes GB', formatBytes(82e9), '82 GB');
check('formatBytes small GB keeps a decimal', formatBytes(9.46e9), '9.5 GB');
check('formatBytes TB', formatBytes(1.5e12), '1.5 TB');
check('formatBytes MB', formatBytes(59e6), '59 MB');

if (failures) {
    print(`\n${failures} failure(s)`);
    System.exit(1);
}
print('\nall passed');
