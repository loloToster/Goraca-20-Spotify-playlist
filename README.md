<br>
<p align="center">
    <img src="readme_assets/goraca20_x_spotify.png" alt="logo" width="60%">
</p>
<h1 align="center">Gorąca 20 Spotify playlist 🔥</h1>

A small project written in typescript that synchronizes a Spotify playlist with current listing of [ESKA Gorąca 20-tka](https://www.eska.pl/goraca20/). It uses a webscrapper to first get data from the page and then updates the playlist via the Spotify API.

### How to use?

1. clone this repo
2. install packages with `npm i`
3. get the client id & client secret on [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
4. fill out the `.env` file
5. run the script with `npm start`
6. go to [localhost:[port]](https://localhost:88/)
7. login with your spotify account
8. choose the playlist

### [Working example](https://open.spotify.com/playlist/6w5BDXi8YGLK0UxPNPFSg4)

### Docker

To run this app with docker build the image and simply run it a container. The exposed port is `8888`. You should also mount a volume on `/app/data` to preserve the user and the choosen playlist. The healthcheck checks whether the app is running and the user is logged in, if either is false the container will be unhealthy.
