/**
 * Uploader
 *
 * @fileoverview
 *
 * Project based automated file upload feature for Komodo
 * 
 * @author Adam Lyskawa
 *
 * Copyright (c) 2012, Adam Lyskawa
 * All rights reserved. 
 * 
 * Redistribution and use in source and binary forms, with or without 
 * modification, are permitted provided that the following conditions are met: 
 * 
 * Redistributions of source code must retain the above copyright notice, 
 * this list of conditions and the following disclaimer. 
 * Redistributions in binary form must reproduce the above copyright 
 * notice, this list of conditions and the following disclaimer in the 
 * documentation and/or other materials provided with the distribution. 
 * Neither the name of nor the names of its contributors may be used to 
 * endorse or promote products derived from this software without specific 
 * prior written permission. 

 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" 
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE 
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE 
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE 
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR 
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF 
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS 
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN 
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) 
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE 
 * POSSIBILITY OF SUCH DAMAGE. 
 */

/**
 * Uploader singleton
 * @constructor
 */
new function() {
    
    this.name = 'uploader'; this.version = '1.63';
    
    if (!ko.extensions) ko.extensions = {};
    if (!ko.extensions[this.name]) ko.extensions[this.name] = this;
    
    /** @type object **/
    this.project = null;
    /** @type string **/
    this.projectName = null;
    /** @type string **/
    this.fileName = null;
    /** @type document **/
    this.document = null;
    /** @type string **/
    this.localPath = null;
    /** @type string **/
    this.localPathPrefix = null;
    /** @type string **/
    this.remotePath = null;
    /** @type RemoteServer **/
    this.remoteServer = null;
    /** @type string **/
    this.URI = null;
    /** @type boolean **/
    this.hasConfig = false;
    /** @type boolean **/
    this.isFileInActiveProject = false;

    // quick servers configuration access
    xtk2.load('chrome://xtk2/content/xtk2-servers.js');
    
    if (ko.notifications) {
        this.notify = function(severity, message, details) {
            ko.notifications.add(
                message, ['uploader'],
                'uploader',
                typeof details !== 'undefined'
                    ? { severity : severity, description : details }
                    : { severity : severity }
            );
        };
        this.notify.INFO = Components.interfaces.koINotification.SEVERITY_INFO;
        this.notify.WARNING = Components.interfaces.koINotification.SEVERITY_WARNING;
        this.notify.ERROR = Components.interfaces.koINotification.SEVERITY_ERROR;
    } else {
        // Komodo console in Output Window
        xtk.load('chrome://xtk2/content/xtk2-console.js');
    }

    ///
    /// Initialization
    ///    

    var self = this, console = xtk2.console, servers = xtk2.servers;   
    
    xtk2.events.komodo_ui_started(function() {
        try {
            self.messages('init');
            self.messages('greeting');
            xtk2.events.file_changed(function() {
                var protocol = arguments[2].replace(/:.*$/, '');
                if (protocol === 'file') self.autoUpload();
            });
            xtk2.events.current_view_changed(function(event) {
				if (ko.views.manager.currentView !== null) ko.views.manager.handle_current_view_changed(event);
                self.isFileInActiveProject = xtk2.ko.isFileInActiveProject();
            });
            xtk2.events.current_project_changed(function() {
                if (self.getConfig())
                    self.isFileInActiveProject = xtk2.ko.isFileInActiveProject();
            });
            self.isFileInActiveProject = xtk2.ko.isFileInActiveProject();
        } catch (e) { self.messages('debug', e); }
    });

    /**
     * Gets configuration for current operation
     */
    this.getConfig = function() {
        this.project = ko.projects.manager.currentProject;
        if (!this.project) {
            this.projectName = false;
            this.remoteServer = false;
            this.isFileInActiveProject = false;
            return false;
        }
        this.isFileInActiveProject = xtk2.ko.isFileInActiveProject();
        this.projectName =
            this.project.name.replace(/\.(kpf|komodoproject)/i, '');
        this.remoteServer =
            new xtk2.servers.remoteServer(this.projectName);
        if (!this.remoteServer.configured) return false;
        this.document = ko.views.manager.currentView.koDoc;
        this.localPath = this.document.file.path.replace(/\\/g, '/');
        this.fileName = this.localPath.replace(/^.*\//, '');
        this.localPathPrefix =
            xtk2.ko.activeProjectDir().replace(/\\/g, '/');
	this.remotePath =
	    this.isFileInActiveProject
		? this.remoteServer.path +
		    this.localPath.replace(this.localPathPrefix, '')
		: '[UNRELATED]';
	this.remoteDir = this.remotePath
	    ? this.remotePath.replace(/\/[^\/]+$/, '')
	    : '';
	this.remoteDirRel = this.remoteDir
	    ? this.remoteDir.replace(this.remoteServer.path, '').replace(/^\//, '')
	    : '';
        this.URI = this.remoteServer.getURI(this.remotePath);
        return true;
    };
    /**
     * Uploads file to remote server using internal Komodo service
     * @returns {boolean} status
     */
    this.upload = function() {
        var last, dirs, retry, done = false;
		setCursor('wait');
		do {
			try {
				
				var newDocument = xtk2.services.doc.createDocumentFromURI(this.URI);
				newDocument.new_line_endings = this.document.new_line_endings;
				newDocument.setBufferAndEncoding(this.document.buffer, this.document.encoding.python_encoding_name);
				newDocument.save(false);
				retry = false;
				done = true;
			} catch (e) {
				dirs = this.remoteServer.createPath(this.remoteDirRel);
				retry = dirs !== last;
				last = dirs;
			} finally {
				setCursor('auto');
			}
		} while (retry);
		return done;
    };
    /**
     * Extension messages
     */
    this.messages = function(status, extras) {
        if (ko.notifications) {
            switch (status) {
                case 'greeting':
                    this.notify(
                        this.notify.INFO,
                        'UPLOADER v' + this.version + ' ready.'
                    );
                    break;
                case 'status':
                    this.notify(
                        this.notify.INFO,
                        'Active project',
                        this.projectName
                    );
                    break;
                case 'uploading':
                    this.notify(
                        this.notify.INFO,
                        'UPLOADING',
                        this.fileName + ' => ' + this.remotePath + '...'
                    );
                    break;
                case 'ok':
                    this.notify(
                        this.notify.INFO,
                        'UPLOADED',
						this.fileName
                    );
                    break;
                case 'error':
                    this.notify(
                        this.notify.ERROR,
                        'ERROR UPLOADING'
                    );
                    break;
                case 'unrelated':
                    this.notify(
                        this.notify.WARNING,
                        'WARNING',
                        'Current file is unrelated, check active project.'
                    );
                    break;
                case 'configure':
                    if (this.projectName)
                        this.notify(
                            this.notify.ERROR,
                            'No configuration found. ' +
                            ' To configure your project for uploads go to ' +
                            'Komodo Edit / Preferences / Servers' +
                            ' and set up new remote account "' +
                            this.projectName + '".' +
                            ' Use "*' + this.projectName +
                            '" for Auto Upload feature enabled.',
                            null
                        );
                    else
                        this.notify(
                            this.notify.ERROR,
                            'No project.',
                            null
                        );
                    break;
                case 'debug':
                    if (extras instanceof Error)
                        this.notify(
                            this.notify.ERROR,
                            'ERROR',
                            extras.message +
                            ' in line ' +
                            extras.lineNumber +
                            ' in ' + extras.fileName + '.'
                        );
                    else
                        this.notify(
                            this.notify.WARNING,
                            'DEBUG',
                            extras
                        );
                    break;
            }
        } else
        if (console) {
            switch (status) {
                case 'init':
                    console.clear();
                    break;
                case 'greeting':
                    console.writeln('UPLOADER v' + this.version + ' ready.', 6);
                    break;
                case 'show':
                    console.popup();
                    break;
                case 'status':
                    var date = new Date();
                    var info = '[ ' + date.getISOTime() + ' ] ';
                    if (this.projectName)
                        info+= 'Active project: ' + this.projectName + ', ';
                    console.write(info, console.S_STRONG);
                    break;
                case 'uploading':
                    console.write('UPLOADING: ', console.S_STRONG);
                    console.write(this.fileName);
                    console.write(' => ', console.S_STRONG);
                    console.write(this.remotePath + '... ');
                    break;
                case 'ok':
                    console.writeln('OK.', console.S_OK);
                    break;
                case 'error':
                    console.popup();
                    console.writeln('FAILED.', console.S_ERROR);
                    this.messages('status');
                    console.write('NOTICE: ', console.S_NOTICE);
                    console.writeln('Check your connection settings ' +
                            'and / or remote permissions.');
                    break;
                case 'unrelated':
                    this.messages('status');
                    console.popup();
                    console.write('WARNING: ', console.S_WARNING);
                    console.writeln('Current file is unrelated, check active project.');
                    break;
                case 'configure':
                    console.popup();
                    this.messages('status');
                    if (this.projectName) {
                        console.writeln('No configuration found.', console.S_ERROR);
                        console.write('NOTICE: ', console.S_NOTICE);
                        console.writeln(
                            ' To configure your project for uploads go to ' +
                            'Komodo Edit / Preferences / Servers' +
                            ' and set up new remote account "' +
                            this.projectName + '".' +
                            ' Use "*' + this.projectName +
                            '" for Auto Upload feature enabled.'
                        );
                    } else console.writeln('No project.', console.S_ERROR);
                    break;
                case 'debug':
                    if (extras instanceof Error) {
                        console.write('ERROR: ', console.S_ERROR);
                        console.write(extras.message, console.S_STRONG);
                        console.write(' in line ');
                        console.write(extras.lineNumber, console.S_STRONG);
                        console.write(' of ');
                        console.write(extras.fileName, console.S_STRONG);
                        console.writeln('.');
                    } else {
                        console.write('DEBUG: ', console.S_NOTICE);
                        console.writeln(extras);
                    }
                    break;
            }
        }
    };
    /**
     * Upload command
     */
    this.cmdUpload = function(auto) {        
	try {
	    if (auto || this.getConfig() || !this.isFileInActiveProject) {
            if (this.isFileInActiveProject) {
                this.messages('status');
                this.messages('uploading', auto);
                var self = this;
                setTimeout(function() {
                    if (self.upload()) self.messages('ok');
                    else self.messages('error');
                }, 200);
            } else if (!auto) {
                if (this.projectName) this.messages('unrelated');
                else this.messages('configure');
            }
	    } else this.messages('configure');
	} catch (e) { this.messages('debug', e); }
    };
    /**
     * Auto upload handler
     */
    this.autoUpload = function() {
        if (this.getConfig() && this.remoteServer.alias.substring(0, 1) === '*')
	    this.cmdUpload(true);
    };
};