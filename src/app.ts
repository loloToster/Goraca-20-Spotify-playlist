import dotenv from "dotenv"
import express from "express"
import JSONdb from "simple-json-db"
import { existsSync } from "fs"

import SpotifyHandler from "./spotify"

process.title = "Goraca20"
dotenv.config()

const dbFilePath =
    existsSync(`${__dirname}/../data`) ?
        `${__dirname}/../data/data.json` : `${__dirname}/../data.json`

const db = new JSONdb<string | undefined>(dbFilePath)

const spotifyHandler = new SpotifyHandler({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT,
    accessToken: db.get("at"),
    refreshToken: db.get("rt"),
    updateInterval: 5,
    playlistId: db.get("playlistId")
}, db)

const app = express()

app.set("view engine", "ejs")
app.set("views", __dirname + "/views")
app.use(express.static(__dirname + "/public"))
app.use(express.json())

app.get("/", async (req, res) => {
    let user: SpotifyApi.CurrentUsersProfileResponse | undefined
    let playlists: SpotifyApi.PlaylistObjectSimplified[] = []

    if (spotifyHandler.loggedIn()) {
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

    const data = await spotifyHandler.authorizationCodeGrant(code.toString())

    spotifyHandler.setAccessToken(data.body.access_token)
    spotifyHandler.setRefreshToken(data.body.refresh_token)
    spotifyHandler.setExpires(data.body.expires_in)

    spotifyHandler.loop()
    res.redirect("/")
})

app.get("/logout", (req, res) => {
    spotifyHandler.resetAccessToken()
    spotifyHandler.resetRefreshToken()
    spotifyHandler.resetExpires()

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

app.get("/health", (req, res) => {
    spotifyHandler.loggedIn() ?
        res.send() : res.status(500).send()
})

const port = process.env.PORT || 88
app.listen(port, () => {
    console.log("Server running on http://localhost:" + port)
    spotifyHandler.loop()
})
