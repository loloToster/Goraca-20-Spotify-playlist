let playlists = Array.from(document.getElementsByClassName("playlist"))

playlists.forEach(pl => {
    pl.addEventListener("click", async () => {
        let res = await fetch("/pl-id", {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: pl.id })
        })
        res = await res.json()
        if (res.code == "success") {
            let setPl = document.getElementsByClassName("set-pl")
            if (setPl.length) {
                setPl = setPl[0]
                setPl.classList.remove("set-pl")
                if (setPl.id == pl.id) return
            }
            pl.classList.add("set-pl")
        }
    })
})
