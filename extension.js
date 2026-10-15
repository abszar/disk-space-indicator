import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {parseMounts, usageFrom, levelFor, shortName, formatBytes} from './lib.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'query_filesystem_info_async');

const REFRESH_SECONDS = 30;
const MIN_SIZE_BYTES = 1e9; // hides /boot/efi and other tiny system partitions
const MENU_BAR_WIDTH = 220;
const MINI_BAR_HEIGHT = 14; // keep in sync with .disk-space-mini-track
const FS_ATTRIBUTES = 'filesystem::size,filesystem::free,filesystem::used';

const DiskSpaceIndicator = GObject.registerClass(
class DiskSpaceIndicator extends PanelMenu.Button {
    _init(uuid) {
        super._init(0.5, 'Disk Space', false);
        this._uuid = uuid;
        this._cancellable = new Gio.Cancellable();
        this._refreshing = false;

        this._panelBox = new St.BoxLayout({
            style_class: 'disk-space-panel',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._panelBox.add_child(new St.Label({text: '💾 …', y_align: Clutter.ActorAlign.CENTER}));
        this.add_child(this._panelBox);

        this._disksSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._disksSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Open Disk Usage Analyzer', () => this._launch('org.gnome.baobab.desktop'));
        this.menu.addAction('Open Disks', () => this._launch('org.gnome.DiskUtility.desktop'));
        this.menu.addAction('Refresh now', () => this.refresh());

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this.refresh();
        });

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
            this.refresh();
            return GLib.SOURCE_CONTINUE;
        });
        this.refresh();
    }

    async refresh() {
        if (this._refreshing)
            return;
        this._refreshing = true;
        try {
            const disks = await this._readDisks();
            if (!this._cancellable.is_cancelled())
                this._render(disks);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.error(`[${this._uuid}] refresh failed: ${e.message}`);
        } finally {
            this._refreshing = false;
        }
    }

    async _readDisks() {
        const [bytes] = await Gio.File.new_for_path('/proc/self/mounts')
            .load_contents_async(this._cancellable);
        const mounts = parseMounts(new TextDecoder().decode(bytes));

        const results = await Promise.all(mounts.map(async mount => {
            try {
                const info = await Gio.File.new_for_path(mount.mountPoint).query_filesystem_info_async(
                    FS_ATTRIBUTES, GLib.PRIORITY_DEFAULT, this._cancellable);
                const usage = usageFrom(
                    info.get_attribute_uint64('filesystem::size'),
                    info.get_attribute_uint64('filesystem::free'),
                    info.get_attribute_uint64('filesystem::used'));
                return {...mount, ...usage};
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.warn(`[${this._uuid}] cannot read ${mount.mountPoint}: ${e.message}`);
                return null;
            }
        }));
        return results.filter(d => d && d.size >= MIN_SIZE_BYTES);
    }

    _render(disks) {
        this._panelBox.destroy_all_children();
        this._disksSection.removeAll();

        if (disks.length === 0) {
            this._panelBox.add_child(new St.Label({text: '💾 ?', y_align: Clutter.ActorAlign.CENTER}));
            this._disksSection.addMenuItem(new PopupMenu.PopupMenuItem('No partition could be read', {reactive: false}));
            return;
        }

        for (const disk of disks) {
            const level = levelFor(disk.percent);
            const item = new St.BoxLayout({style_class: 'disk-space-panel-item'});
            item.add_child(new St.Label({text: shortName(disk.mountPoint), y_align: Clutter.ActorAlign.CENTER}));
            item.add_child(this._miniBar(disk.percent, level));
            item.add_child(new St.Label({
                text: `${disk.percent}%`,
                style_class: level === 'ok' ? null : `disk-space-${level}`,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            this._panelBox.add_child(item);

            this._disksSection.addMenuItem(this._menuItemFor(disk, level));
        }
    }

    // Vertical bar that fills from the bottom, like a battery gauge
    _miniBar(percent, level) {
        const track = new St.Widget({
            style_class: 'disk-space-mini-track',
            layout_manager: new Clutter.BinLayout(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        track.add_child(new St.Widget({
            style_class: `disk-space-fill-${level}`,
            style: `height: ${Math.max(1, Math.round(MINI_BAR_HEIGHT * Math.min(percent, 100) / 100))}px;`,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.END,
        }));
        return track;
    }

    _menuItemFor(disk, level) {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, style_class: 'disk-space-menu-item'});
        const box = new St.BoxLayout({vertical: true, x_expand: true});

        const title = new St.BoxLayout();
        title.add_child(new St.Label({text: disk.mountPoint, style_class: 'disk-space-menu-title'}));
        title.add_child(new St.Label({
            text: `  ${disk.device.replace('/dev/', '')}`,
            style_class: 'disk-space-menu-device',
            y_align: Clutter.ActorAlign.END,
        }));
        box.add_child(title);

        const track = new St.Widget({style_class: 'disk-space-track', style: `width: ${MENU_BAR_WIDTH}px;`});
        track.add_child(new St.Widget({
            style_class: `disk-space-fill disk-space-fill-${level}`,
            style: `width: ${Math.round(MENU_BAR_WIDTH * Math.min(disk.percent, 100) / 100)}px;`,
        }));
        box.add_child(track);

        box.add_child(new St.Label({
            text: `${formatBytes(disk.used)} used of ${formatBytes(disk.size)} · ${formatBytes(disk.free)} free · ${disk.percent}%`,
            style_class: 'disk-space-menu-details',
        }));

        item.add_child(box);
        return item;
    }

    _launch(desktopId) {
        const app = Shell.AppSystem.get_default().lookup_app(desktopId);
        if (app)
            app.activate();
        else
            Main.notify('Disk Space', `${desktopId} is not installed`);
    }

    destroy() {
        this._cancellable.cancel();
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        super.destroy();
    }
});

export default class DiskSpaceExtension extends Extension {
    enable() {
        this._indicator = new DiskSpaceIndicator(this.uuid);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
