import SpotifyWebApi from "spotify-web-api-node"
import JSONdb from "simple-json-db"

import { song } from "./types"
import scrapeEska from "./scrapper"

interface Options extends Exclude<ConstructorParameters<typeof SpotifyWebApi>[0], undefined> {
    updateInterval: number,
    playlistId: string | undefined
}

export default class SpotifyHandler extends SpotifyWebApi {
    playlistId: string | undefined
    updateInterval: number

    lastUpdate: Date | undefined
    lastError: any
    lastSongs: string | undefined

    private mainLoopTimeout: NodeJS.Timeout | undefined

    constructor(options: Options, private db: JSONdb<string | undefined>) {
        super(options)

        this.playlistId = options.playlistId
        this.updateInterval = options.updateInterval
        this.mainLoopTimeout = undefined
    }

    loggedIn() {
        return Boolean(this.getAccessToken())
    }

    setAccessToken(accessToken: string) {
        this.db.set("at", accessToken)
        super.setAccessToken(accessToken)
    }

    resetAccessToken() {
        this.db.set("at", undefined)
        super.resetAccessToken()
    }

    setRefreshToken(refreshToken: string) {
        this.db.set("rt", refreshToken)
        super.setRefreshToken(refreshToken)
    }

    resetRefreshToken() {
        this.db.set("rt", undefined)
        super.resetRefreshToken()
    }

    setExpires(expiresIn: number) {
        this.db.set("expires", (Date.now() + expiresIn * 500).toString())
    }

    getExpires() {
        return parseInt(this.db.get("expires") || "0")
    }

    resetExpires() {
        this.db.set("expires", undefined)
    }

    async updatePlaylist(songs: song[]) {
        if (!this.playlistId) return

        let newTracks: string[] = []

        for (const song of songs) {
            const query = song.title + " " + song.artists
            const res = await this.searchTracks(query)
            const searchResults = res.body.tracks?.items
            if (searchResults && searchResults.length)
                newTracks.push(searchResults[0].uri)
        }

        await this.replaceTracksInPlaylist(this.playlistId, newTracks)
    }

    async refreshTokenLoopWrapper() {
        if (Date.now() > this.getExpires()) {
            const res = await this.refreshAccessToken()
            const at = res.body.access_token
            const expiresIn = res.body.expires_in

            this.setAccessToken(at)
            this.setExpires(expiresIn)
        }

        return this.getAccessToken()
    }

    private async songsLoopWrapper() {
        this.lastUpdate = new Date()
        const currentSongs = await scrapeEska()

        if (this.lastSongs != JSON.stringify(currentSongs)) {
            await this.updatePlaylist(currentSongs)
            this.lastSongs = JSON.stringify(currentSongs)
        }
    }

    async loop() {
        if (this.mainLoopTimeout) clearTimeout(this.mainLoopTimeout)

        try {
            if (!this.loggedIn()) return

            await this.refreshTokenLoopWrapper()

            if (this.playlistId) {
                await this.songsLoopWrapper()
            }
        } catch (err) {
            this.lastError = err
            console.error(err)
        }

        this.mainLoopTimeout = setTimeout(this.loop.bind(this), this.updateInterval * 60 * 1000)
    }
}
