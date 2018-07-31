const Web3 = require('web3');
const fs = require('fs');
const oracleAbi = require('./oracle_abi.js');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.File({ filename: 'logs/combined.log' })
    ]
  });

const db = JSON.parse(fs.readFileSync('db.json'));
const config = JSON.parse(fs.readFileSync('config.json'));

var web3 = new Web3(config.node);

const oracleContract = new web3.eth.Contract(
    oracleAbi,
    config.oracleContractAddress,
    null
);

var fromBlock = getLastBlockProcessed();
if (fromBlock > 0) {
    fromBlock++;
}

var lastBlock = fromBlock;
oracleContract.getPastEvents('RecordRequested', {fromBlock: fromBlock}).then(async (events) => {
    for (let i = 0; i < events.length; i++) {
        await processRecordRequest(events[i]);
        if (events[i].blockNumber > lastBlock) {
            lastBlock = events[i].blockNumber;
        }
    }

    setLastBlockProcessed(lastBlock);

    process.exit();
});


async function processRecordRequest(event) {
    const subject = event.returnValues.subject;
    const key = event.returnValues.key;
    const keyDecoded = web3.utils.hexToUtf8(key);

    var value = null;
    if (db[subject] && db[subject][keyDecoded]) {
        value = db[subject][keyDecoded];
    }

    if (value) {
        const trx = {
            from: config.keyAddr,
            to: config.oracleContractAddress,
            chainId: config.chainId,
            gas: config.gas,
            data: oracleContract.methods.setRecord(
                key,
                value,
                subject
            ).encodeABI()
        };

        const result = await web3.eth.accounts.signTransaction(trx, config.keyPk)
        .then((sgnTrx) => {
            return web3.eth.sendSignedTransaction(sgnTrx.rawTransaction);
        }).catch((error) => {
            logger.error(error);
        });
        logger.info(result);
    }
}

function getLastBlockProcessed() {
    var lastBlockProcessed = 0;
    try {
        lastBlockProcessed = fs.readFileSync('last_block_processed').toString();
        lastBlockProcessed = parseInt(lastBlockProcessed, 10);
        if (isNaN(lastBlockProcessed)) {
            lastBlockProcessed = 0;
        }
    } catch (error) {
        lastBlockProcessed = 0;
    }
    return lastBlockProcessed;
}

function setLastBlockProcessed(blockNumber) {
    fs.writeFileSync('last_block_processed', blockNumber);
}