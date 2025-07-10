#!/usr/bin/env python3

import os, subprocess

linuxUserId = os.getenv('USERID')
linuxGroupId = os.getenv('GROUPID')
sambaUsername = os.getenv('SAMBA_USERNAME')
sambaPassword = os.getenv('SAMBA_PASSWORD')
remoteDomain = os.getenv('REMOTE_DOMAIN')
remoteUsername = os.getenv('REMOTE_USERNAME')
remotePassword = os.getenv('REMOTE_PASSWORD')

totalProxyCount = 0
enabledProxyCount = 0

i = 0
while True:
  i = i + 1
  shareEnable = os.getenv('PROXY{}_ENABLE'.format(i))
  if shareEnable == None:
    break
  totalProxyCount += 1

  if not shareEnable == "1":
    continue
  enabledProxyCount += 1

  shareName = os.getenv('PROXY{}_SHARE_NAME'.format(i))
  shareDirectory = '/share{}'.format(i)
  remotePath = os.getenv('PROXY{}_REMOTE_PATH'.format(i))
  remoteMount = '/remote{}'.format(i)

  # SMB Mount
  print("Mounting '{share}' with user '{domain}\\{username}' at '{directory}'".format(
    share = remotePath,
    domain = remoteDomain,
    username = remoteUsername,
    directory = remoteMount
  ))
  if not os.path.exists(remoteMount):
    os.mkdir(remoteMount)
  subprocess.call("chown {}:{} {}".format(linuxUserId, linuxGroupId, remoteMount), shell=True)
  ret = subprocess.call('mount -t cifs -o username={username},password={password},domain={domain},vers={vers},uid={uid},gid={gid} "{share}" "{directory}"'.format(
    domain = remoteDomain,
    username = remoteUsername,
    password = remotePassword,
    vers = '3.0',
    uid = linuxUserId,
    gid = linuxGroupId,
    share = remotePath,
    directory = remoteMount
  ), shell=True)
  if ret != 0:
    os.rmdir(remoteMount)
    print("Mounting failed!")
    exit(1)

  # Samba Share
  print("Setting up share '{share}' for User '{username}' at '{directory}'".format(
    share = shareName,
    username = sambaUsername,
    directory = shareDirectory
  ))
  if not os.path.exists(shareDirectory):
    os.mkdir(shareDirectory)
  subprocess.call("chown {}:{} {}".format(linuxUserId, linuxGroupId, shareDirectory), shell=True)
  os.environ['SHARE{}'.format(i)] = "{};{};yes;no;no;{}".format(shareName, shareDirectory, sambaUsername)
  
  # Rsync clone the remote to the share folder
  print("Cloning remote share to local share directory")
  subprocess.call("rsync -av --delete {remote}/ {local}".format(
    remote = remoteMount,
    local = shareDirectory
  ), shell=True)

print("{}/{} enabled Proxies.".format(enabledProxyCount, totalProxyCount))
if enabledProxyCount == 0:
  exit(0)

# Global Samba settings
os.environ['USER'] = "{};{}".format(sambaUsername, sambaPassword)
os.environ['RECYCLE'] = "x" # disable recycle bin
os.environ['SMB'] = "x" # disable SMB2 minimum version

subprocess.call('/usr/bin/supervisord -c /etc/supervisord.conf', shell=True)
