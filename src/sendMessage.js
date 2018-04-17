'use strict';

const utils = require('../utils');

module.exports = (defFunc, api, ctx) => {

    let handleAttachment = (msg, form) => {
        if (!msg.attachments) {
            return;
        }
        form['image_ids'] = [];
        form['gif_ids'] = [];
        form['file_ids'] = [];
        form['video_ids'] = [];
        form['audio_ids'] = [];

        let files = [];
        for (let attachment of msg.attachments) {
            let formAtt = {
                upload_1024: attachment,
                voice_clip: 'true'
            };
            files.push(
                defFunc.postFormData('https://upload.facebook.com/ajax/mercury/upload.php', ctx.jar, formAtt, {})
                    .then(utils.parseAndCheckLogin(ctx, defFunc))
                    .then(res => res.payload.metadata[0]));
        }
        return Promise.all(files)
            .then(files => {
                files.forEach(file => {
                    let key = Object.keys(file);
                    let type = key[0];
                    form['' + type + 's'].push(file[type]);
                });
            });
    };
    let handleUrl = (msg, form) => {
        if (!msg.url) {
            return;
        }

        form['shareable_attachment[share_type]'] = '100';
        let formUrl = {
            image_height: 960,
            image_width: 960,
            uri: msg.url
        };

        return defFunc.post('https://www.facebook.com/message_share_attachment/fromURI/', ctx.jar, formUrl)
            .then(utils.parseAndCheckLogin(ctx, defFunc))
            .then(res => {
                form['shareable_attachment[share_params]'] = res.payload.share_data.share_params;
            });
    };

    let handleMention = (msg, form) => {
        if (!msg.mentions) {
            return;
        }
        form['profile_xmd'] = [];
        for (let mention of msg.mentions) {
            let tag = mention.tag;
            let offset = msg.body.indexOf(tag, mention.index || 0);

            if (offset < 0) {
                console.log('warn', 'handleMention', 'Mention for "' + tag + '" not found in message string.');
            }

            if (mention.id === null) {
                console.log('warn', 'handleMention', 'Mention id should be non-null.');
            }
            let id = mention.id || 0;
            let length = tag.length;
            form['profile_xmd'].push({offset, length, id, type: 'p'});
        }
    };
    let sendMsg = (msg, form, threadId) => {
        form['specific_to_list'] = ['fbid:' + threadId, 'fbid:' + ctx.userId];
        form['other_user_fbid'] = threadId;

        console.log('form', form);
        return defFunc
            .post('https://www.facebook.com/messaging/send/', ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defFunc))
    };

    return (msg, threadId) => {
        if (typeof msg === 'string') {
            msg = {body: msg};
        }
        let messageAndOTId = utils.generateOfflineThreadingId();
        let form = {
            client: 'mercury',
            action_type: 'ma-type:user-generated-message',
            timestamp: Date.now(),
            source: 'source:chat:web',
            body: msg.body ? msg.body.toString() : '',
            ui_push_phase: 'C3',
            offline_threading_id: messageAndOTId,
            message_id: messageAndOTId,
            has_attachment: !!(msg.attachment || msg.url || msg.sticker)
        };

        if (msg.sticker) {
            form['sticker_id'] = msg.sticker;
        }
        let msgPromise = new Promise(resolve => resolve());
        msgPromise = msgPromise
            .then(() => handleAttachment(msg, form))
            .then(() => handleUrl(msg, form))
            .then(() => handleMention(msg, form))
            .then(() => sendMsg(msg, form, threadId));
    }

};