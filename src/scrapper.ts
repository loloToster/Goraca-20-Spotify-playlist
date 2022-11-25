import axios from "axios"
import * as cheerio from "cheerio"
import { song } from "./types"

const ESKA_URL = "https://www.eska.pl/goraca20/"

export default async function scrapeEska() {
    let html = (await axios.get(ESKA_URL)).data
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

