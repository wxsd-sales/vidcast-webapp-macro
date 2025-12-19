
/********************************************************
 * Macro Author:      	William Mills
 *                    	Technical Solutions Specialist 
 *                    	wimills@cisco.com
 *                    	Cisco Systems
 * 
 * Version: 1-0-0
 * Released: 11/13/25
 * 
 * This is an example macro which demonstrates how to open and
 * control playback of Vidcast videos from a paired Room Navigator.
 * 
 * Full Readme, source code and license details available here:
 * https://github.com/wxsd-sales/vidcast-webapp-macro
 * 
 ********************************************************/

import xapi from 'xapi';


/*********************************************************
 * Configure the settings below
**********************************************************/

const config = {
  button: {
    name: 'Vidcast',
    icon: 'https://app.vidcast.io/icon.png'
  },
  vidcast: {
    playlistId: '727b3694-97d2-4a6c-97b1-6511d17514d3',
  },
  playerUrl: 'https://socketeer.glitch.me/vidcastAlpine.html',
  panelId: 'vidcast'
}


/*********************************************************
 * Below contains all the call event listeners
**********************************************************/

let webviews = { 'OSD': null, 'Controller': null };
let opening = false;

init();

async function init() {

  createButton();

  const playlist = await getPlaylist();
  //console.log(JSON.stringify(playlist))
  await savePlaylistUI(playlist);

  await deleteAccount(config.panelId)

  createIntegrationAccount(config.panelId, 'Cisco123')
  const hash = await generateHash(config.panelId, 'Cisco123', true)

  console.log(hash)


  xapi.Event.UserInterface.Extensions.Panel.Clicked.on(processClicks);

  //xapi.Status.UserInterface.WebView.on(status=>console.log(status))


  xapi.Status.UserInterface.WebView.on(({ URL, Type, id, ghost }) => {
    if (ghost && (webviews.OSD == id || webviews.Controller == id)) {
      if (webviews.Controller == id) xapi.Command.UserInterface.WebView.Clear({ Target: 'OSD' })
      if (webviews.OSD == id) xapi.Command.UserInterface.WebView.Clear({ Target: 'Controller' })
      webviews.OSD = null;
      webviews.Controller = null;
      deleteAccount(config.panelId);
      return
    }

    if (!URL && Type != 'Integration') return
    if (!URL.startsWith(config.playerUrl)) return
    const target = URL.includes('target=OSD') ? 'OSD' : 'Controller';
    webviews[target] = id;
  })


}






async function processClicks({ PanelId }) {
  if (!PanelId.startsWith(config.panelId)) return
  if (opening) return
  if (webviews.OSD) return
  if (webviews.Controller) return
  opening = true;
  setTimeout(() => {
    opening = false;
  }, 2000)
  const playlist = await getPlaylist();
  //console.log(JSON.stringify(playlist))
  await savePlaylistUI(playlist);

  openWebviews();

  return

  const extensions = await xapi.Command.UserInterface.Extensions.List({ ActivityType: 'Custom' })

  const panels = extensions?.Extensions?.Panel;

  const channelPanel = panels.find(panel => panel.PanelId == config.panelId + 'playlist')

  const widgets = channelPanel?.Page?.[0]?.Row?.[0]?.Widget

  console.log(widgets)

  const recoveredPlaylist = widgets.map(widget => {
    const values = widget?.ValueSpace?.Value;
    console.log(values)
    return values.reduce((obj, item) => Object.assign(obj, { [atob(item.Name)]: atob(item.Key) }), {});
  })

  console.log(recoveredPlaylist)


}


async function getPlaylist() {
  const playlistId = config.vidcast.playlistId;
  const url = `https://api.vidcast.io/v1/playlists/${playlistId}/videos`
  const params = `?page=0&pageSize=20&skipUnavailable=false`;
  console.log('getting', url + params)
  try {
    const result = await xapi.Command.HttpClient.Get({ Url: url + params, ResultBody: 'PlainText' });
    const body = JSON.parse(result.Body)
    const content = body?.content;
    return content
  } catch (error) {
    console.log(error)
  }
}


async function openWebviews() {
  console.log('Opening WebViews')
  const username = config.panelId;
  const password = await createIntegrationAccount(username)
  const playerUrl = config.playerUrl + '#' + await generateHash(username, password, false)
  const controllerUrl = config.playerUrl + '?target=OSD#' + await generateHash(username, password, true)
  console.log(playerUrl)
  console.log(controllerUrl)
  const Title = config.button.name;

  xapi.Command.UserInterface.WebView.Display({ Title, Url: playerUrl, Target: 'OSD', Mode: 'Fullscreen' }).then(result => console.log('OSD Result', result))
  xapi.Command.UserInterface.WebView.Display({ Title, Url: controllerUrl, Target: 'Controller', Mode: 'Fullscreen' })
}



async function createAccount(username, password) {

  const existingAccount = await findAccount(username);
  if (existingAccount) {
    console.log(`User Account [${username}] - Already Exists - Recreating`);
    await deleteAccount(username);
    return createAccount(username, password)
  }

  console.log(`User Account [${username}] - Not Found - Creating New Account`)
  console.log(existingAccount)
  return xapi.Command.UserManagement.User.Add({
    Active: 'True',
    Passphrase: password,
    PassphraseChangeRequired: 'False',
    Role: ['Integrator', 'User'],
    ShellLogin: 'True',
    Username: username
  })
    .then(result => console.log('Create user result:', result.status))
    .catch(error => console.warn('Error creating user:', JSON.stringify(error)))
}

async function deleteAccount(username) {

  const existingAccount = await findAccount(username);
  if (!existingAccount) {
    console.log(`User Account [${username}] - Not Found - Delete Cancelled`);
    return
  }
  console.log(`User Account [${username}] - Deleting`)
  return new Promise(function (resolve) {
    xapi.Command.UserManagement.User.Delete({ Username: username })
      .then(async ({ status }) => {
        console.log(`User Account [${username}] - Deleted`);
        await sleep(200)
        resolve(status)
      })
      .catch(error => {
        console.log(`User Account [${username}] - Delete Error - ${error}`);
        resolve()
      })

  });
}

function olkDeleteAccount() {
  console.log(`Deleting user [${config.panelId}]`)
  return xapi.Command.UserManagement.User.Delete({ Username: config.panelId })
    .then(result => {
      console.log(`[${config.panelId}] delete status:`, result.status);
    })
    .catch(error => {
      console.log('Error caught')
      if (!error.message.endsWith('does not exist')) {
        console.warning(`Error deleting user [${config.panelId}]:`, JSON.stringify(error));
      } else {
        console.log(error.message);
      }

    })
}

async function findAccount(username) {
  const query = await xapi.Command.UserManagement.User.List();
  const users = query?.User;
  if (!users) return
  return users.find(user => user.Username == username)
}


function createPassword(length) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz!@#$%^&*()ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let password = '';
  for (let i = 0; i < length; i++) {
    let randomNumber = Math.floor(Math.random() * chars.length);
    password += chars.substring(randomNumber, randomNumber + 1);
  }
  return password;
}

async function createIntegrationAccount(username, password) {
  password = password ?? createPassword(255);
  await createAccount(username, password)
  return password
}

async function generateHash(username, password, controllerMode = false) {
  const ipAddress = await xapi.Status.Network[1].IPv4.Address.get();
  return btoa(JSON.stringify({ username, password, ipAddress, controllerMode }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createButton() {
  const panelId = config.panelId;
  const button = config.button;
  const order = await panelOrder(panelId)
  const icon = (button.icon.startsWith('http')) ? await getIcon(button.icon) : `<Icon>${button.icon}</Icon>`
  const color = `<Color>${button.color}</Color>` ?? '';

  const panel = `
    <Extensions>
      <Panel>
        ${order}
        <Type>Statusbar</Type>
        <Location>HomeScreen</Location>
        ${icon}
        ${color}
        <Name>${button.name}</Name>
        <ActivityType>Custom</ActivityType>
      </Panel>
    </Extensions>`;

  xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId }, panel)
    .catch(e => console.log('Error saving panel: ' + e.message))
}

async function savePlaylistUI(playlist) {
  const panelId = config.panelId
  const playlistId = panelId + 'playlist';
  const fields = ['name', 'description', 'camera_thumbnail_asset_url',
    'matrix_thumbnail_asset_url', 'camera_asset_url', 'preview_asset_url'];


  const groupButtons = playlist.map(item => {

    const values = fields.map(field => {
      return `<Value><Key>${btoa(item[field])}</Key><Name>${btoa(field)}</Name></Value>`
    }).join('')
    return `<Widget>
              <WidgetId>${panelId}-${item.id}</WidgetId>
              <Type>GroupButton</Type>
              <Options>size=4;columns=4</Options>
              <ValueSpace>
                ${values}
              </ValueSpace>
            </Widget>`
  }).join('')

  const panel = `
    <Extensions>
      <Panel>
        <Location>Hidden</Location>
        <Name>${playlistId}</Name>
        <ActivityType>Custom</ActivityType>
        <Page>
          <Name>${playlistId}</Name>
          <Row>${groupButtons}</Row>
          <PageId>${playlistId}</PageId>
          <Options>hideRowNames=1</Options>
        </Page>
      </Panel>
    </Extensions>`;

  xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: playlistId }, panel)
    .catch(e => console.log('Error saving panel: ' + e.message))
}


function replaceSpecialCharacters(text) {
  return text
    .replaceAll(/&/g, "&amp;")
    .replaceAll(/</g, "&lt;")
    .replaceAll(/>/g, "&gt;")
  //.replaceAll(/"/g, "&quot;")
  //.replaceAll(/'/g, "&apos;");
}


/*********************************************************
 * Gets the current Panel Order if exiting Macro panel is present
 * to preserve the order in relation to other custom UI Extensions
 **********************************************************/
async function panelOrder(panelId) {
  const list = await xapi.Command.UserInterface.Extensions.List({ ActivityType: "Custom" });
  const panels = list?.Extensions?.Panel
  if (!panels) return ''
  const existingPanel = panels.find(panel => panel.PanelId == panelId)
  if (!existingPanel) return ''
  return `<Order>${existingPanel.Order}</Order>`
}


/*********************************************************
 * Downloads Icon from provided URL and returns the 
 * Icon Id as the required UI Extension XML string
 **********************************************************/
function getIcon(url) {
  return xapi.Command.UserInterface.Extensions.Icon.Download({ Url: url })
    .then(result => `<Icon>Custom</Icon><CustomIcon><Id>${result.IconId}</Id></CustomIcon>`)
    .catch(error => {
      console.log('Unable to download icon: ' + error.message)
      return ''
    })
}


