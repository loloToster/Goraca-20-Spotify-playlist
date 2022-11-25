import dotenv from "dotenv"
import express from "express"
import JSONdb from "simple-json-db"

import SpotifyHandler from "./spotify"

process.title = "Goraca20"
dotenv.config()

const db = new JSONdb<string | undefined>(__dirname + "/../data.json")

const spotifyHandler = new SpotifyHandler({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT,
    updateInterval: 10,
    description: (last, next) =>
        `Radio ESKA 🎵 Zautomatyzowana playlista z piosenkami z Gorącej 20. Następna aktualizacja za ${next} minut, ostatnia aktualizacja ${last} minut temu.`,
    playlistId: db.get("playlistId")
})

const app = express()

app.set("view engine", "ejs")
app.set("views", __dirname + "/views")
app.use(express.static(__dirname + "/public"))
app.use(express.json())

app.get("/", async (req, res) => {
    let user: SpotifyApi.CurrentUsersProfileResponse | undefined
    let playlists: SpotifyApi.PlaylistObjectSimplified[] = []

    if (spotifyHandler.getAccessToken()) {
        user = (await spotifyHandler.getMe()).body
        playlists = (await spotifyHandler.getUserPlaylists())
            .body.items
            .filter(pl => pl.owner.id == user!.id)
    }

    res.render("index", {
        user,
        playlists,
        setPl: spotifyHandler.playlistId,
        dashboard: {
            lastUpdate: spotifyHandler.lastUpdate,
            lastError: spotifyHandler.lastError
        }
    })
})

app.get("/login", (req, res) => {
    const scopes = [
        "playlist-modify-public",
        "playlist-read-private",
        "playlist-modify-private"
    ]

    res.redirect(spotifyHandler.createAuthorizeURL(scopes, "state"))
})

app.get("/callback", async (req, res) => {
    const { error, code } = req.query

    if (error) {
        console.error("Callback Error:", error)
        res.send(`Callback Error: ${error}`)
        return
    }

    if (!code) return console.log("No code in callback")

    let data = await spotifyHandler.authorizationCodeGrant(code.toString())

    const accessToken = data.body.access_token
    const refreshToken = data.body.refresh_token
    const expiresIn = data.body.expires_in

    spotifyHandler.setAccessToken(accessToken)
    spotifyHandler.setRefreshToken(refreshToken)

    spotifyHandler.loop()
    res.redirect("/")

    setInterval(async () => {
        const data = await spotifyHandler.refreshAccessToken()
        const accessToken = data.body.access_token
        spotifyHandler.setAccessToken(accessToken)
    }, expiresIn / 2 * 1000)
})

app.get("/logout", (req, res) => {
    spotifyHandler.resetAccessToken()
    spotifyHandler.resetRefreshToken()
    res.redirect("/")
})

app.put("/pl-id", async (req, res) => {
    const reqPlaylistId: string = req.body.id
    const curPlaylistId = db.get("playlistId")
    const newPlaylistId = curPlaylistId == reqPlaylistId ? undefined : reqPlaylistId
    spotifyHandler.playlistId = newPlaylistId
    db.set("playlistId", newPlaylistId)
    spotifyHandler.loop()
    res.json({ code: "success" })
})

app.get("/exit", () => {
    process.exit(0)
})

const port = process.env.PORT || 88
app.listen(port, () => {
    console.log("Server running on http://localhost:" + port)
    spotifyHandler.loop()
})
