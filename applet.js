const Applet = imports.ui.applet;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Cinnamon = imports.gi.Cinnamon;
const Gettext = imports.gettext;
const GTop = imports.gi.GTop;
const NM = imports.gi.NM;

const CPU = function () {
    this._init.apply(this, arguments);
};

CPU.prototype = {
	_init: function() {
        this.gtop = new GTop.glibtop_cpu();
		this.total = this.gtop.total;
		this.user = this.gtop.user;
		this.sys = this.gtop.sys;
		this.iowait = this.gtop.iowait;
	},

	refresh: function() {
        GTop.glibtop_get_cpu(this.gtop);

		let total = this.gtop.total - this.total;
		let user = this.gtop.user - this.user;
		let sys = this.gtop.sys - this.sys;
        let iowait = this.gtop.iowait - this.iowait;

	    this.used = Math.round((user + sys + iowait) * 100 / total);
		this.total = this.gtop.total;
		this.user = this.gtop.user;
		this.sys = this.gtop.sys;
		this.iowait = this.gtop.iowait;
	}
}

const Memory = function () {
    this._init.apply(this, arguments);
};

Memory.prototype = {
	_init: function() {
        this.gtop = new GTop.glibtop_mem();
	},

	refresh: function() {
        GTop.glibtop_get_mem(this.gtop);
		this.used = Math.round(this.gtop.user / 1024 / 1024 / 1024 * 10) / 10;
		this.usedPercentaje = Math.round(this.gtop.user * 100 / this.gtop.total);
	}
}

const Net = function () {
    this._init.apply(this, arguments);
};

Net.prototype = {
	_init: function() {
        this.connections = [];
        this.client = NM.Client.new(null);
		this.update_connections();

        if (!this.connections.length){
            let net_lines = Cinnamon.get_file_contents_utf8_sync('/proc/net/dev').split("\n");
            for (let i = 3; i < net_lines.length - 1 ; i++) {
                let connection = net_lines[i].replace(/^\s+/g, '').split(":")[0];
                if(Cinnamon.get_file_contents_utf8_sync('/sys/class/net/' + connection + '/operstate')
                .replace(/\s/g, "") == "up" &&
                connection.indexOf("br") < 0 &&
                connection.indexOf("lo") < 0) {
                	this.connections.push(connection);
                }
            }
        }

        this.gtop = new GTop.glibtop_netload();

		try {
            let connection_list = this.client.get_devices();
            this.NMsigID = []
            for (let j = 0; j < connection_list.length; j++){
                this.NMsigID[j] = connection_list[j].connect('state-changed', Lang.bind(this, this.update_connections));
            }
        }
        catch(e) {
            global.logError("Please install Missing Dependencies");
        }

        this.totalDownloaded = 0;
        this.totalUploaded = 0;
        this.lastRefresh = 0;
	},

	update_connections: function() {
        try {
            this.connections = []
            let connection_list = this.client.get_devices();
            for (let j = 0; j < connection_list.length; j++){
                if (connection_list[j].state == NM.DeviceState.ACTIVATED){
                   this.connections.push(connection_list[j].get_ip_iface());
                }
            }
        }
        catch(e) {
            global.logError("Please install Missing Dependencies");
        }
    },

	refresh: function() {
		let totalDownloaded = 0;
		let totalUploaded = 0;

		for (let i in this.connections) {
			GTop.glibtop_get_netload(this.gtop, this.connections[i]);
			totalDownloaded += this.gtop.bytes_in;
			totalUploaded += this.gtop.bytes_out;
		}

		let time = GLib.get_monotonic_time() / 1000;
		let delta = time - this.lastRefresh;

		this.downloadSpeed = delta > 0 ? Math.round((totalDownloaded - this.totalDownloaded) / delta) : 0;
		this.uploadSpeed = delta > 0 ? Math.round((totalUploaded - this.totalUploaded) / delta) : 0;

		this.downloadSpeed = this.downloadSpeed < 1024 ? this.downloadSpeed + "KB" :
			Math.round(this.downloadSpeed / 1024 * 100) / 100 + "MB";

		this.uploadSpeed = this.uploadSpeed < 1024 ? this.uploadSpeed + "KB" :
			Math.round(this.uploadSpeed / 1024 * 100) / 100 + "MB";

        this.totalDownloaded = totalDownloaded;
        this.totalUploaded = totalUploaded;
		this.lastRefresh = time;
	}
}

function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.Applet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.Applet.prototype._init.call(this, orientation, panel_height, instance_id);

        this.setupUI();
    },

    setupUI: function() {
        this.set_applet_tooltip("bliblablub");

        this.values = new St.BoxLayout({vertical: true});
        this.values2 = new St.BoxLayout({vertical: true});
		
        this.valueCPU = new St.Label({text: "0%"});
        this.valueMemory = new St.Label({text: "0GB"});
        this.valueDownload = new St.Label({text: "0B"});
        this.valueUpload = new St.Label({text: "0B"});

        this.values.add(this.valueDownload);
        this.values.add(this.valueUpload);

        this.values2.add(this.valueCPU);
        this.values2.add(this.valueMemory);

        this.actor.add(this.values);
        this.actor.add(this.values2);

		//this.actor.add_style_class_name('mainContainer');
        this.actor.width = 100;

		this.cpu = new CPU();
        this.memory = new Memory();
        this.net = new Net();
		
		this._updateWidget();
    },

    on_desklet_removed: function() {
		Mainloop.source_remove(this.timeout);
	},

	_updateWidget: function(){
        this._updateValues();
		this.timeout = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._updateWidget));
	},

	_updateValues: function(){
		this.cpu.refresh();
        this.memory.refresh();
        this.net.refresh();
		
        this.valueCPU.text = this.cpu.used + "%";
        this.valueMemory.text = this.memory.used + "GB";
        this.valueDownload.text = this.net.downloadSpeed;
        this.valueUpload.text = this.net.uploadSpeed;
    }

};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(orientation, panel_height, instance_id);
}
