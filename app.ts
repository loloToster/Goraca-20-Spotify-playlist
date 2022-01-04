process.title = "Goraca20"

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
dotenv.config()

import express from "express"
import axios from "axios"
import cheerio from "cheerio"
import SpotifyWebApi from "spotify-web-api-node"
import { readFileSync, writeFileSync, existsSync } from "fs"

function readJSON(file: string) {
    return JSON.parse(readFileSync(file).toString())
}

function writeJSON(file: string, data: object) {
    writeFileSync(file, JSON.stringify(data))
}

if (!existsSync("data.json"))
    writeJSON("data.json", {})

const app = express()

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT,
})

app.set("view engine", "ejs")
app.use(express.static("public"))
app.use(express.json())

const loggedIn = () => Boolean(spotifyApi.getAccessToken())

const UPDATE_INTERVAL = 10 // in minutes

let lastUpdate: Date

let lastError: any = "None"
function lastErrorHandler(err: any) {
    lastError = err
    console.error(lastError)
}

app.get("/", async (req, res) => {
    let user: SpotifyApi.CurrentUsersProfileResponse | undefined
    let playlists: SpotifyApi.PlaylistObjectSimplified[] = []
    if (loggedIn()) {
        user = (await spotifyApi.getMe()).body
        playlists = (await spotifyApi.getUserPlaylists())
            .body.items
            .filter(pl => pl.owner.id == user!.id)
    }
    let setPl: string
    let dataFile = readJSON("data.json")
    setPl = dataFile.id
    res.render("index", {
        user: user, playlists: playlists, setPl: setPl, dashboard: {
            lastUpdate: lastUpdate,
            lastError: lastError
        }
    })
})

app.get("/login", (req, res) => {
    res.redirect(spotifyApi.createAuthorizeURL(scopes, "some status"))
})

app.get("/callback", async (req, res) => {
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

    // console.log(Sucessfully retreived access token. Expires in ${expiresIn} s.)
    res.redirect("/")

    setInterval(async () => {
        const data = await spotifyApi.refreshAccessToken()
        const access_token = data.body.access_token

        // console.log("The access token has been refreshed!")
        // console.log("access_token:", access_token)
        spotifyApi.setAccessToken(access_token)
    }, expiresIn / 2 * 1000)

})

app.get("/logout", (req, res) => {
    spotifyApi.resetAccessToken()
    spotifyApi.resetRefreshToken()
    res.redirect("/")
})

app.put("/pl-id", async (req, res) => {
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

function scrapeEska(html: string): song[] {
    const $ = cheerio.load(html)
    let songElements = $(".single-hit")
    let songs: song[] = []
    songElements.each((i, el) => {
        const element = $(el)
        if (element.hasClass("radio--hook")) return

        let info = $(element.children(".single-hit__info"))
        let artists = ""
        info.children("ul").children().each((i, e) => {
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

async function updatePlaylist(playlistId: string, songs: song[]) {
    let newTracks: string[] = []

    for (let i = 0; i < songs.length; i++) {
        const song = songs[i]
        let searchResults = (await spotifyApi.searchTracks(song.title + " " + song.artists)).body.tracks?.items
        if (!searchResults || !searchResults.length)
            continue
        newTracks.push(searchResults[0].uri)
    }

    await spotifyApi.replaceTracksInPlaylist(playlistId, newTracks)
}

let lastSongs: string
async function updateSongsLoop(playlistId: string) {
    lastUpdate = new Date()
    let html = (await axios.get(ESKA_URL)).data
    let currentSongs = scrapeEska(html)
    if (lastSongs == JSON.stringify(currentSongs))
        return console.log("The same songs")

    console.log("Different songs")
    lastSongs = JSON.stringify(currentSongs)

    await updatePlaylist(playlistId, currentSongs)
}

const UPDATE_INTERVAL_MS = UPDATE_INTERVAL * 60 * 1000
async function updateDescriptionLoop(playlistId: string) {
    let now = new Date()
    let diff = now.getTime() - lastUpdate.getTime()
    let nextUpdateTime = UPDATE_INTERVAL_MS - diff
    nextUpdateTime = Math.round((nextUpdateTime / 1000) / 60)
    let lastUpdateTime = UPDATE_INTERVAL - nextUpdateTime
    await spotifyApi.changePlaylistDetails(playlistId, {
        description:
            `Radio ESKA 🎵 Zautomatyzowana playlista z piosenkami z Gorącej 20. Następna aktualizacja za ${nextUpdateTime} minut, ostatnia aktualizacja ${lastUpdateTime} minut temu.`
    })
}

let iteration = UPDATE_INTERVAL
async function mainLoop() {
    try {
        if (!loggedIn()) return
        let dataFile = readJSON("data.json")
        if (dataFile.id) {
            if (!(iteration % UPDATE_INTERVAL))
                await updateSongsLoop(dataFile.id)
            await updateDescriptionLoop(dataFile.id)
            iteration++
            if (iteration == UPDATE_INTERVAL + 1)
                iteration = iteration - UPDATE_INTERVAL
        }
    } catch (err) {
        lastErrorHandler(err)
    }
}

setInterval(mainLoop, 60 * 1000)
