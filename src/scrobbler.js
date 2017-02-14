var fs          = require('fs');
var gracefulFs      = require('graceful-fs');
gracefulFs.gracefulify(fs);

import filehound    from 'filehound';
import id3          from 'node-id3';
import mm           from 'music-metadata';
import util         from 'util';

import config       from '../config.json';
import Api          from './api.js';
import log          from './logger.js';

const parseFoundFiles = (files) => {
    const tags = files.map((file) => {
        return new Promise((resolveParser) => {
            const audioStream = fs.createReadStream(file);
            mm.parseStream(audioStream, {native: true}, function (err, metadata) {
                audioStream.close();
                if (err) {
                    log('Error while parsing');
                    log(err);
                    resolveParser({fileInfo: {path: file}, songInfo: null});
                }
                // Why change 'id3v2.3' into 'id3'? Because json doesn't like the dot in the naming.
                Object.keys(metadata).map((flag) => {
                    log('Flag is ' + flag);
                    const tempData = metadata[flag];
                    delete metadata[flag];
                    metadata[flag.replace('.', '-')] = tempData;
                });

                log('Parsed ' + file);
                resolveParser({fileInfo: {path: file}, songInfo: metadata});
            });
        });
    });
    return Promise.all(tags);
};

const checkMongoResponse = (response) => {
    if (response.result && response.result.ok === 1) {
        return true;
    }
    return false;
};

const scrobbler = () => {
    // Wipe everything from db
    return Api.del([{}])
    .then((response) => {
        log('Deleted Database');
        // Fetch new files
        return filehound.create()
        .paths(config.musicDir)
        .ext('mp3')
        .find();
    })
    .then((foundFiles) => {
        log('Found files');
        return parseFoundFiles(foundFiles);
    })
    .then((taggedFiles) => {
        log('Uploading found files');
        return Api.put(taggedFiles);
    })
    .then((response) => {
        if (checkMongoResponse(response)){
            log('Succesfully updated database');
            return {success: true};
        } else {
            log('Error pushing data to database');
            return {success: false};
        }
    })
    .catch((error) => {
        log('An error occured in scrobbler.js');
        throw error;
    });
};

process.on('message', (m) => {
    console.log('CHILD got message:', m);
    scrobbler().then(() => {
        process.send({succes: true});
    });
});

export default scrobbler;
