const scopes = [
    /* "ugc-image-upload",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "streaming",
    "app-remote-control",
    "user-read-email",
    "user-read-private", 
    "playlist-read-collaborative",*/
    "playlist-modify-public",
    "playlist-read-private",
    "playlist-modify-private",
    /* "user-library-modify",
    "user-library-read",
    "user-top-read",
    "user-read-playback-position",
    "user-read-recently-played",
    "user-follow-read",
    "user-follow-modify" */
]
const ESKA_URL = "https://www.eska.pl/goraca20/"

import dotenv from "dotenv"
import express from "express"
import axios from "axios"
import cheerio from "cheerio"
import SpotifyWebApi from "spotify-web-api-node"
import fs from "fs"

function readJSON(file: string) {
    return JSON.parse(fs.readFileSync(file).toString())
}

function writeJSON(file: string, data: object) {
    fs.writeFileSync(file, JSON.stringify(data))
}

if (!fs.existsSync("data.json"))
    writeJSON("data.json", {})

dotenv.config()
const app = express()

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT,
})

app.set("view engine", "ejs")
app.use(express.static("public"))
app.use(express.json())

async function loggedIn() {
    try {
        await spotifyApi.getMe()
    } catch (error) {
        return false
    }
    return true
}

let mainLoopTimeout: any

app.get("/", async (req: express.Request, res: express.Response) => {
    let user: any = false
    let playlists: any[] = []
    if (await loggedIn()) {
        user = await spotifyApi.getMe()
        playlists = (await spotifyApi.getUserPlaylists()).body.items
        playlists = playlists.filter(pl => pl.owner.id == user.body.id)
    }
    let setPl: string
    let dataFile = readJSON("data.json")
    setPl = dataFile.id
    res.render("index", { user: user, playlists: playlists, setPl: setPl })
})

app.get("/login", (req: express.Request, res: express.Response) => {
    res.redirect(spotifyApi.createAuthorizeURL(scopes, "jakis status"))
})

app.get("/callback", async (req: express.Request, res: express.Response) => {
    const error = req.query.error
    const code = req.query.code

    if (error) {
        console.error("Callback Error:", error)
        res.send(`Callback Error: ${error}`)
        return
    }

    if (!code) return console.log("No code in callback")

    let data = await spotifyApi.authorizationCodeGrant(code.toString())

    const accessToken = data.body.access_token
    const refreshToken = data.body.refresh_token
    const expiresIn = data.body.expires_in

    spotifyApi.setAccessToken(accessToken)
    spotifyApi.setRefreshToken(refreshToken)

    /* console.log("access_token:", access_token)
    console.log("refresh_token:", refresh_token) */

    // console.log(`Sucessfully retreived access token. Expires in ${expiresIn} s.`)
    res.redirect("/")
    mainLoop()

    setInterval(async () => {
        const data = await spotifyApi.refreshAccessToken()
        const access_token = data.body.access_token

        // console.log("The access token has been refreshed!")
        // console.log("access_token:", access_token)
        spotifyApi.setAccessToken(access_token)
    }, expiresIn / 2 * 1000)

})

app.get("/logout", (req: express.Request, res: express.Response) => {
    clearTimeout(mainLoopTimeout)
    spotifyApi.resetAccessToken()
    spotifyApi.resetRefreshToken()
    res.redirect("/")
})

app.put("/pl-id", async (req: express.Request, res: express.Response) => {
    const playlistId: string = req.body.id
    let dataFile = readJSON("data.json")
    if (dataFile.id == playlistId) {
        dataFile.id = undefined
    } else {
        dataFile.id = playlistId
    }
    writeJSON("data.json", dataFile)
    res.json({ code: "success" })
})

const port = process.env.PORT || 88
app.listen(port, () => {
    console.log("Server running on http://localhost:" + port)
})

interface song {
    title: string,
    artists: string
}

type listOfSongs = song[]

function scrapeEska(html: string): listOfSongs {
    const $ = cheerio.load(html)
    let songElements = $(".single-hit")
    let songs: listOfSongs = []
    songElements.each((i: number, element: any) => {
        element = $(element)
        if (element.hasClass("radio--hook")) return

        let info = $(element.children(".single-hit__info"))
        let artists = ""
        info.children("ul").children().each((i: number, e: any) => {
            artists += $(e).text().trim() + " "
        })
        songs.push({
            title: info.children(".single-hit__title").text(),
            artists: artists.trim()
        })

        let position = element.find(".single-hit__position")
        if ($(position).text() === "20") return false
    })
    return songs
}

const UPDATE_INTERVAL = 10
const UPDATE_INTERVAL_MILLIS = UPDATE_INTERVAL * 60 * 1000

let lastSongs: listOfSongs = []
let iteration = UPDATE_INTERVAL
let lastUpdate: Date

async function mainLoop() {
    let dataFile = readJSON("data.json")
    if (dataFile.id) {
        if (!(iteration % UPDATE_INTERVAL))
            await updateSongsLoop(dataFile.id)
        await updateDescriptionLoop(dataFile.id)
    }
    iteration++
    if (iteration == UPDATE_INTERVAL + 1)
        iteration = iteration - UPDATE_INTERVAL
    mainLoopTimeout = setTimeout(mainLoop, 60 * 1000)
}

async function updateSongsLoop(playlistId: string) {
    lastUpdate = new Date()
    let html = (await axios.get(ESKA_URL)).data
    let currentSongs = scrapeEska(html)
    if (JSON.stringify(lastSongs) == JSON.stringify(currentSongs))
        return console.log("The same songs")

    console.log("Different songs")
    lastSongs = currentSongs

    let trackItems = (await spotifyApi.getPlaylist(playlistId)).body.tracks.items
    let plTracksUris = trackItems.map(item => { return { uri: item.track.uri } })
    await spotifyApi.removeTracksFromPlaylist(playlistId, plTracksUris)
    let newTracks: string[] = []

    for (let i = 0; i < currentSongs.length; i++) {
        const song = currentSongs[i]
        let searchResults = (await spotifyApi.searchTracks(song.title + " " + song.artists)).body.tracks!.items
        if (!searchResults)
            return
        newTracks.push(searchResults[0].uri)
    }
    await spotifyApi.replaceTracksInPlaylist(playlistId, newTracks)
}

async function updateDescriptionLoop(playlistId: string) {
    let now = new Date()
    let diff = now.getTime() - lastUpdate.getTime()
    let nextUpdateTime = UPDATE_INTERVAL_MILLIS - diff
    nextUpdateTime = Math.round((nextUpdateTime / 1000) / 60)
    let lastUpdateTime = UPDATE_INTERVAL - nextUpdateTime           // Last updated ${lastUpdateTime} minutes ago, next update in ${nextUpdateTime} minutes 
    await spotifyApi.changePlaylistDetails(playlistId, { description: `Ostatnia aktualizacja ${lastUpdateTime} minut temu, następna aktualizacja za ${nextUpdateTime} minut` })
}
