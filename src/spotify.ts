import SpotifyWebApi from "spotify-web-api-node"

import { song } from "./types"
import scrapeEska from "./scrapper"

type descriptionEval = (last: number, next: number) => string

interface Options extends Exclude<ConstructorParameters<typeof SpotifyWebApi>[0], undefined> {
    updateInterval: number,
    description: descriptionEval,
    playlistId: string | undefined
}

export default class SpotifyHandler extends SpotifyWebApi {
    playlistId: string | undefined
    description: descriptionEval
    updateInterval: number

    lastUpdate: Date | undefined
    lastError: any
    lastSongs: string | undefined

    private mainLoopIteration: number
    private mainLoopTimeout: NodeJS.Timeout | undefined
    private updateIntervalMS: number

    constructor(options: Options) {
        super(options)

        this.playlistId = options.playlistId
        this.description = options.description
        this.updateInterval = options.updateInterval

        this.mainLoopIteration = this.updateInterval
        this.mainLoopTimeout = undefined
        this.updateIntervalMS = this.updateInterval * 60 * 1000
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

    private async songsLoopWrapper() {
        this.lastUpdate = new Date()
        const currentSongs = await scrapeEska()

        if (this.lastSongs != JSON.stringify(currentSongs)) {
            await this.updatePlaylist(currentSongs)
            this.lastSongs = JSON.stringify(currentSongs)
        }
    }

    private async descriptionLoopWrapper() {
        if (!this.playlistId || !this.lastUpdate) return

        const diff = new Date().getTime() - this.lastUpdate.getTime()
        const nextUpdateTime = Math.round((this.updateIntervalMS - diff) / 1000 / 60)
        const lastUpdateTime = this.updateInterval - nextUpdateTime

        const description = this.description(lastUpdateTime, nextUpdateTime)

        await this.changePlaylistDetails(this.playlistId, {
            description
        })
    }

    async loop() {
        if (this.mainLoopTimeout) clearTimeout(this.mainLoopTimeout)

        try {
            if (!this.getAccessToken()) return

            if (this.playlistId) {
                if (!(this.mainLoopIteration % this.updateInterval))
                    await this.songsLoopWrapper()
                await this.descriptionLoopWrapper()
                this.mainLoopIteration++
                if (this.mainLoopIteration == this.updateInterval + 1)
                    this.mainLoopIteration -= this.updateInterval
            }
        } catch (err) {
            this.lastError = err
            console.error(err)
        }

        this.mainLoopTimeout = setTimeout(this.loop.bind(this), 60 * 1000)
    }
}
