"use strict";

const XOR_KEY = 0x5A;
const MANIFEST_PATH = "assets/post.json.bin";
const assetUrls = [];

const elements = {
    authorName: document.getElementById("author-name"),
    verifiedBadge: document.getElementById("verified-badge"),
    authorHandle: document.getElementById("author-handle"),
    postDate: document.getElementById("post-date"),
    dateDivider: document.getElementById("date-divider"),
    postText: document.getElementById("post-text"),
    avatar: document.getElementById("avatar"),
    avatarFallback: document.getElementById("avatar-fallback"),
    video: document.getElementById("post-video"),
    mediaStatus: document.getElementById("media-status"),
    errorMessage: document.getElementById("error-message")
};

function resolveAssetPath(path)
{
    if (typeof path !== "string" || !/^assets\/[a-z0-9_.\/-]+\.bin$/i.test(path) || path.includes("..") || path.includes("//"))
        throw new Error(`Invalid asset path: ${String(path)}`);

    return new URL(path, document.baseURI).href;
}

async function readEncodedAsset(path)
{
    const url = resolveAssetPath(path);
    let response;

    try
    {
        response = await fetch(url, { cache: "no-cache" });
    }
    catch (error)
    {
        throw new Error(`Could not load ${path}. Check the site URL and use HTTP or HTTPS.`, { cause: error });
    }

    if (!response.ok)
        throw new Error(`Asset ${path} is unavailable: HTTP ${response.status}. Check the file and GitHub Pages settings.`);

    const bytes = new Uint8Array(await response.arrayBuffer());

    for (let index = 0; index < bytes.length; index++)
    {
        bytes[index] ^= XOR_KEY;
    }

    return bytes;
}

function assetBlobUrl(bytes, mime)
{
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));

    assetUrls.push(url);

    return url;
}

function showError(message)
{
    elements.errorMessage.textContent = message;
    elements.errorMessage.hidden = false;
}

function validateManifest(manifest)
{
    if (!manifest || typeof manifest !== "object" || !manifest.author || !manifest.post || !manifest.assets)
        throw new Error("Invalid post JSON structure.");

    if (typeof manifest.author.name !== "string" || !manifest.author.name.trim())
        throw new Error("Missing author.name in JSON.");

    if (typeof manifest.author.handle !== "string" || !manifest.author.handle.trim())
        throw new Error("Missing author.handle in JSON.");

    if (manifest.author.verified !== undefined && typeof manifest.author.verified !== "boolean")
        throw new Error("author.verified must be a boolean if supplied.");

    if (typeof manifest.post.text !== "string")
        throw new Error("Missing post.text in JSON.");

    for (const field of ["avatar", "video"])
    {
        const resource = manifest.assets[field];

        if (!resource || typeof resource.mime !== "string")
            throw new Error(`Missing asset configuration for ${field} in JSON.`);

        resolveAssetPath(resource.path);
    }
}

function renderManifest(manifest)
{
    const name = manifest.author.name.trim();
    const handle = manifest.author.handle.trim().replace(/^@/, "");
    const postText = manifest.post.text.trim();
    const publishedAt = manifest.post.publishedAt;

    document.title = String(manifest.siteTitle || name);
    elements.authorName.textContent = name;
    elements.verifiedBadge.hidden = manifest.author.verified === false;
    elements.authorHandle.textContent = `@${handle}`;
    elements.avatarFallback.textContent = name.slice(0, 1).toUpperCase();
    elements.postText.textContent = postText;
    elements.postText.hidden = !postText;

    if (publishedAt)
    {
        const date = new Date(publishedAt);

        if (!Number.isNaN(date.getTime()))
        {
            elements.postDate.dateTime = date.toISOString();
            elements.postDate.textContent = new Intl.DateTimeFormat("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric"
            }).format(date);
            elements.postDate.hidden = false;
            elements.dateDivider.hidden = false;
        }
    }
}

async function loadAvatar(resource, authorName)
{
    const bytes = await readEncodedAsset(resource.path);
    const url = assetBlobUrl(bytes, resource.mime);

    elements.avatar.alt = `Avatar of ${authorName}`;

    await new Promise((resolve, reject) =>
    {
        elements.avatar.onload = resolve;
        elements.avatar.onerror = () => reject(new Error(`Could not display image ${resource.path}.`));
        elements.avatar.src = url;
    });

    elements.avatar.hidden = false;
    elements.avatarFallback.hidden = true;
}

async function attemptPlayback()
{
    elements.video.muted = false;
    elements.video.defaultMuted = false;

    try
    {
        await elements.video.play();
    }
    catch (error)
    {
        if (error.name !== "NotAllowedError")
            throw error;
    }
}

async function loadVideo(resource)
{
    const bytes = await readEncodedAsset(resource.path);
    const url = assetBlobUrl(bytes, resource.mime);

    await new Promise((resolve, reject) =>
    {
        const media = elements.video;

        media.onloadedmetadata = resolve;
        media.onerror = () => reject(new Error(`Could not decode video ${resource.path}. Check the file format and codecs.`));
        media.muted = false;
        media.src = url;
        media.load();
    });

    elements.mediaStatus.hidden = true;

    await attemptPlayback();
}

async function initialize()
{
    try
    {
        const bytes = await readEncodedAsset(MANIFEST_PATH);
        const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

        validateManifest(manifest);
        renderManifest(manifest);

        const avatarTask = loadAvatar(manifest.assets.avatar, manifest.author.name).catch((error) =>
        {
            console.error(error);
            showError(error.message);
        });

        await loadVideo(manifest.assets.video);
        await avatarTask;
    }
    catch (error)
    {
        console.error(error);
        elements.mediaStatus.textContent = "Could not load video.";
        showError(error.message);
    }
}


window.addEventListener("pagehide", () =>
{
    for (const url of assetUrls)
    {
        URL.revokeObjectURL(url);
    }
});

initialize();
