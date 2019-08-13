#!/usr/bin/env node

const {promisify} = require('util')
const fs = require('fs')
const glob = promisify(require('glob'))
const https = require('https')
const stat = promisify(fs.stat)

const USER_AGENT = 'jclem/github-release'
const REPO = process.env.GITHUB_REPOSITORY

let {
  tagName,
  targetCommitish,
  name,
  body,
  draft,
  prerelease,
  assets,
  githubToken
} = process.env

tagName = tagName || null
targetCommitish = targetCommitish || null
name = name || null
body = body || null
draft = draft === 'true'
prerelease = prerelease === 'true'
assets = assets || null
githubToken = githubToken || null

main().catch(err => {
  console.error(err)
  process.exit(1)
})

async function main() {
  const releaseID = await createRelease()
  await uploadReleaseAssets(releaseID)
}

async function createRelease() {
  console.log(`Creating release ${tagName} in ${REPO}`)

  const data = {tag_name: tagName}
  if (targetCommitish) data.target_commitish = targetCommitish
  if (name) data.name = name
  if (body) data.body = body
  if (draft != null) data.draft = draft
  if (prerelease != null) data.prerelease = prerelease

  const [req, json] = makePost(
    `https://api.github.com/repos/${REPO}/releases`,
    {
      headers: {
        authorization: `Bearer ${githubToken}`,
        'content-type': 'application/json',
        'user-agent': USER_AGENT
      }
    }
  )

  req.write(JSON.stringify(data))
  req.end()

  return (await json).id
}

async function uploadReleaseAssets(releaseID) {
  console.log(`Uploading to release ${releaseID}`)

  const matches = await glob(assets)

  return Promise.all(
    matches.map(async match => {
      console.log(`Uploading to release ${releaseID}: ${match}`)
      const name = encodeURIComponent(match)
      const size = (await stat(match)).size
      const rs = fs.createReadStream(match)

      const [req, json] = makePost(
        `https://uploads.github.com/repos/${REPO}/releases/${releaseID}/assets?name=${name}`,
        {
          headers: {
            authorization: `Bearer ${githubToken}`,
            'content-type': 'application/octet-stream',
            'user-agent': USER_AGENT,
            'content-length': size
          }
        }
      )
      rs.pipe(req)
      return json
    })
  )
}

function makePost(url, opts, expectedStatus = 201) {
  let req

  const json = new Promise((resolve, reject) => {
    req = https.request(url, {...opts, method: 'POST'}, res => {
      let rawBody = ''
      res.on('data', chunk => (rawBody += chunk))
      res.on('end', () => {
        const body = JSON.parse(rawBody)

        if (res.statusCode !== expectedStatus) {
          console.warn(body)
          reject(new Error(`Expected ${expectedStatus}, got ${res.statusCode}`))
          return
        }

        resolve(body)
      })
    })

    req.on('error', reject)
  })

  return [req, json]
}
