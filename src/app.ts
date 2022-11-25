import dotenv from "dotenv"
import express from "express"
import SpotifyWebApi from "spotify-web-api-node"
import { existsSync } from "fs"

import { writeJSON, readJSON, scrapeEska } from "./utils"
import { song } from "./types"

process.title = "Goraca20"
dotenv.config()

if (!existsSync("data.json"))
    writeJSON("data.json", {})

const scopes = [
    "playlist-modify-public",
    "playlist-read-private",
    "playlist-modify-private"
]

const app = express()

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT,
})

app.set("view engine", "ejs")
app.set("views", __dirname + "/views")
app.use(express.static(__dirname + "/public"))
app.use(express.json())

const loggedIn = () => Boolean(spotifyApi.getAccessToken())

const UPDATE_INTERVAL = 10 // in minutes
const UPDATE_INTERVAL_MS = UPDATE_INTERVAL * 60 * 1000

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

    let dataFile = readJSON("data.json")
    let setPl: string = dataFile.id

    res.render("index", {
        user, playlists, setPl, dashboard: {
            lastUpdate: lastUpdate,
            lastError: lastError
        }
    })
})

app.get("/login", (req, res) => {
    res.redirect(spotifyApi.createAuthorizeURL(scopes, "state"))
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

    await mainLoop()
    res.redirect("/")

    setInterval(async () => {
        const data = await spotifyApi.refreshAccessToken()
        const accessToken = data.body.access_token
        spotifyApi.setAccessToken(accessToken)
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
    dataFile.id = dataFile.id == playlistId ? undefined : playlistId
    writeJSON("data.json", dataFile)
    res.json({ code: "success" })
})

app.get("/exit", () => {
    process.exit(0)
})

const port = process.env.PORT || 88
app.listen(port, () => {
    console.log("Server running on http://localhost:" + port)
})

async function updatePlaylist(playlistId: string, songs: song[]) {
    let newTracks: string[] = []

    for (const song of songs) {
        const query = song.title + " " + song.artists
        const res = await spotifyApi.searchTracks(query)
        const searchResults = res.body.tracks?.items
        if (searchResults && searchResults.length)
            newTracks.push(searchResults[0].uri)
    }

    await spotifyApi.replaceTracksInPlaylist(playlistId, newTracks)
}

let lastSongs: string
async function updateSongsLoop(playlistId: string) {
    lastUpdate = new Date()
    const currentSongs = await scrapeEska()

    if (lastSongs != JSON.stringify(currentSongs)) {
        await updatePlaylist(playlistId, currentSongs)
        lastSongs = JSON.stringify(currentSongs)
    }
}

async function updateDescriptionLoop(playlistId: string) {
    const now = new Date()
    const diff = now.getTime() - lastUpdate.getTime()
    const nextUpdateTime = Math.round((UPDATE_INTERVAL_MS - diff / 1000) / 60)
    let lastUpdateTime = UPDATE_INTERVAL - nextUpdateTime
    await spotifyApi.changePlaylistDetails(playlistId, {
        description:
            `Radio ESKA 🎵 Zautomatyzowana playlista z piosenkami z Gorącej 20. Następna aktualizacja za ${nextUpdateTime} minut, ostatnia aktualizacja ${lastUpdateTime} minut temu.`
    })
}

let iteration = UPDATE_INTERVAL
let mainLoopTimeout: NodeJS.Timeout
async function mainLoop() {
    clearTimeout(mainLoopTimeout)
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
    mainLoopTimeout = setTimeout(mainLoop, 60 * 1000)
}
