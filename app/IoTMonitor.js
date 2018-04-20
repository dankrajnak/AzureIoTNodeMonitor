const {fork, execSync} = require('child_process');
const Client = require('azure-iot-device').Client;
const ConnectionString = require('azure-iot-device').ConnectionString;
const Message = require('azure-iot-device').Message;
const Protocol = require('azure-iot-device-mqtt').Mqtt;

var config;

export default class IoTMonitor{
  constructor(connectionString = false){
    this.methodListeners = [];
    this.backProcessesRunning = [];
    this.connectionString = connectionString || process.env['AzureIoTHubDeviceConnectionString'];
    this.client = null;
    this.connected = false;
  }

  /**
   * Javascript proceses to be run in the background must be in their own file.
   *
   * @param {string} eventName Name of event to listen to from the IotHub
   * @param {string} fileName  Relative path to the javascript file
   */
  addRunInBackgroundListener(eventName, fileName){
    this.methodListeners.push({
      type: 'background',
      eventName: eventName,
      fileName: fileName
    });
    this.client.onDeviceMethod(eventName, (res, req)=>this._forkProcessCallback(res, req, fileName));
  }

  /**
   * [addSameThreadMethodListener description]
   * @param {string} eventName [description]
   * @param {function} method    [description]
   */
  addSameThreadMethodListener(eventName, method){
    this.methodListeners.push({
      type: 'same thread',
      eventNamae: eventName,
      method: method
    });

    this.client.onDeviceMethod(eventName, (res, req)=>this._runSameThreadCallBack(res, req, method));

  }

  connect(){
    return new Promise((resolve, reject)=>{
      try{
        this.client = Client.fromConnectionString(this.connectionString, Protocol);
      } catch(e){
        reject(e);
      }
      this.client.open((err)=>{
        if(err){
          reject(err);
        } else{
          this.connected = true;
          this.client.sendEvent(new Message('Connected!'));
          console.log('Connected!')
          resolve();
        }
      })
    })
  }

  /**
   * Meant for simple, synchronous methods which quickly terminate.
   * @param  {[type]} method [description]
   * @param  {[type]} args   [description]
   * @return {[type]}        [description]
   */
  runOnSameThread(method, args){
    /* Re-write console.log.
     This might be a really stupid way to do this.
     It also won't work if the method is asynchronous.  It will revert
     console.log before those methods run. */
    let consoleLog = console.log;
    console.log = ()=>{
      let logs = arguments;
      if(this.connected){
        this.client.sendEvent(new Message({
          message: 'Log from '+method.name,
          data: logs
        }));
      }
      consoleLog(arguments);
    }
    try {
      method(...args);
    } catch (e) {
      if(this.connected){
        this.client.sendEvent(new Message({
          message: 'Error in '+method.name,
          data: e
        }))
        consoleLog(e);
      }
    } finally{
      console.log = consoleLog;
    }
  }

  forkProcess(fileName){
    if(!this.connected){
      console.error('Client not connected while forking process');
    } else{
      this.client.sendEvent(new Message({message:'Forking '+fileName}))
    }

    let forked;

    try{
      forked = fork(fileName, [], { silent: true });
    }
    catch(error){
      if(this.connected){
        this.client.sendEvent(new Message({
          message: 'Error forking '+fileName,
          data: error
        }))
      }
      console.error('Error forking '+fileName, error);
      return false;
    }

    forked.on('error', (error)=>{
      if(this.connected){
        this.client.sendEvent(new Message({
          message: 'Error forking '+ fileName,
          data: error.toString()
        }), (err)=>IoTMonitor._handleMessageSendError);
      }
      console.error('Error forking '+ fileName, error)
      return false;
    })

    this.backProcessesRunning.push({
      fileName: fileName,
      fork: forked
    })

    forked.on('exit', (code, signal)=>{
      if(this.connected){
        this.client.sendEvent(new Message({
          message: fileName+' ended',
          data: error.toString()
        }), (err)=>IoTMonitor._handleMessageSendError);
      }
      console.log(fileName + 'ended');
    })

    if(this.connected){
      forked.stdout.on('data', (data)=>{
        this.client.sendEvent(new Message({
          message: 'Message from '+ fileName,
          data: data.toString()
        }), (err)=>IoTMonitor._handleMessageSendError)
      });

      forked.stderr.on('data', (data)=>{
        this.client.sendEvent(new Message({
          message: 'Error in '+ fileName,
          data: data.toString()
        }), (err)=>IoTMonitor._handleMessageSendError)
      });
    }
    return true;
  }

  _forkProcessCallback(request, response, fileName){
    console.log('Got message to fork ' + fileName);
    if(this.forkProcess(fileName)){
      response.send(200, 'Successfully forked ' + fileName, (err)=>{
        if (err){
          IoTMonitor._handleMessageSendError(err);
        }
      })
    } else{
      response.send(500, 'Error Forking ' + fileName, (err)=>{
        if(err){
          IoTMonitor._handleMessageSendError(err);
        }
      })
    }
  }

  _runOnSameThreadCallback(request, response, method){
    console.log('Got message to run '+ method.name+'('+request.payload||''+')')

    if(this.runOnSameThread(method, request.payload)){
      response.send(200, 'Successfully ran '+method.name+'('+request.payload||''+')', (err)=>{
        if (err){
          IoTMonitor._handleMessageSendError(err);
        }
      })
    } else{
      response.send(500, 'Error running ' + method.name, (err)=>{
        if(err){
          IoTMonitor._handleMessageSendError(err);
        }
      })
    }
  }

  static _handleMessageSendError(error){
    console.error(error);
  }
}
