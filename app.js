"use strict";

const XOR_KEY = 0x5A;
const MANIFEST_PATH = "assets/posts.json.bin";
const FOOTER_PATH = "assets/footer.json.bin";
const assetUrls = new Set();
const videoUrls = new Map();
const entries = [];

const postsRoot = document.getElementById("posts-root");
const pageError = document.getElementById("page-error");
const postTemplate = document.getElementById("post-template");
const siteFooter = document.getElementById("site-footer");
const footerLinks = document.getElementById("footer-links");

function validateVideoName(filename)
{
    if (typeof filename !== "string" || !/^[a-z0-9_-][a-z0-9_.-]*\.bin$/i.test(filename) || filename.includes(".."))
        throw new Error(`Invalid video filename: ${String(filename)}`);

    if (["avatar.bin", "posts.json.bin", "footer.json.bin"].includes(filename.toLowerCase()))
        throw new Error(`Reserved video filename: ${filename}`);

    return filename;
}

function resolveAssetPath(path)
{
    if (typeof path !== "string" || !/^assets\/[a-z0-9_-][a-z0-9_.-]*\.bin$/i.test(path) || path.includes(".."))
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
        throw new Error(`Could not load ${path}. Use HTTP or HTTPS and check the site URL.`, { cause: error });
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

    assetUrls.add(url);

    return url;
}

function showPageError(message)
{
    pageError.textContent = message;
    pageError.hidden = false;
}

function validateFooter(footer)
{
    if (!footer || typeof footer !== "object" || Array.isArray(footer))
        throw new Error("Footer JSON root must be an object.");

    if (!Array.isArray(footer.links))
        throw new Error("Footer links must be an array.");

    if (footer.separator !== undefined && typeof footer.separator !== "string")
        throw new Error("Footer separator must be a string.");

    for (const [index, link] of footer.links.entries())
    {
        if (!link || typeof link !== "object" || Array.isArray(link))
            throw new Error(`Footer links[${index}] must be an object.`);

        if (typeof link.label !== "string" || !link.label.trim())
            throw new Error(`Footer links[${index}].label must be a nonempty string.`);

        if (typeof link.url !== "string")
            throw new Error(`Footer links[${index}].url must be a URL string.`);

        let url;

        try
        {
            url = new URL(link.url);
        }
        catch (error)
        {
            throw new Error(`Footer links[${index}].url must be an absolute HTTP or HTTPS URL.`, { cause: error });
        }

        if (url.protocol !== "http:" && url.protocol !== "https:")
            throw new Error(`Footer links[${index}].url must use HTTP or HTTPS.`);
    }
}

async function loadFooter()
{
    const bytes = await readEncodedAsset(FOOTER_PATH);
    const footer = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

    validateFooter(footer);

    const separator = footer.separator === undefined ? "•" : footer.separator;

    for (const [index, item] of footer.links.entries())
    {
        const group = document.createElement("span");

        group.className = "footer-item";

        if (index > 0 && separator)
        {
            const element = document.createElement("span");

            element.className = "footer-separator";
            element.textContent = separator;
            element.setAttribute("aria-hidden", "true");
            group.appendChild(element);
        }

        const link = document.createElement("a");

        link.className = "footer-link";
        link.href = item.url;
        link.textContent = item.label.trim();
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        group.appendChild(link);
        footerLinks.appendChild(group);
    }

    siteFooter.hidden = footer.links.length === 0;
}

function validateManifest(manifest)
{
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        throw new Error("The JSON root must be an object.");

    if (Object.hasOwn(manifest, "post"))
        throw new Error("The singular post field is unsupported. Use a posts array.");

    if (!manifest.author || typeof manifest.author !== "object")
        throw new Error("Missing author object in JSON.");

    if (typeof manifest.author.name !== "string" || !manifest.author.name.trim())
        throw new Error("Missing author.name in JSON.");

    if (typeof manifest.author.handle !== "string" || !manifest.author.handle.trim())
        throw new Error("Missing author.handle in JSON.");

    if (manifest.author.verified !== undefined && typeof manifest.author.verified !== "boolean")
        throw new Error("author.verified must be a boolean.");

    if (!Array.isArray(manifest.posts) || manifest.posts.length === 0)
        throw new Error("posts must be a nonempty array.");

    if (!manifest.assets || !manifest.assets.avatar || !manifest.assets.videos)
        throw new Error("Missing encoded asset metadata in JSON. Run encode-assets.py.");

    const avatar = manifest.assets.avatar;

    resolveAssetPath(avatar.path);

    if (!["image/png", "image/jpeg", "image/webp"].includes(avatar.mime))
        throw new Error("Unsupported avatar MIME type.");

    const videoTypes = manifest.assets.videos;

    if (typeof videoTypes !== "object" || Array.isArray(videoTypes))
        throw new Error("assets.videos must be an object.");

    for (const [index, post] of manifest.posts.entries())
    {
        if (!post || typeof post !== "object" || Array.isArray(post))
            throw new Error(`posts[${index}] must be an object.`);

        if (Object.hasOwn(post, "videoLabel"))
            throw new Error(`posts[${index}].videoLabel is unsupported.`);

        if (typeof post.text !== "string")
            throw new Error(`posts[${index}].text must be a string.`);

        if (post.publishedAt !== undefined && (typeof post.publishedAt !== "string" || Number.isNaN(Date.parse(post.publishedAt))))
            throw new Error(`posts[${index}].publishedAt must be a valid date string.`);

        const filename = validateVideoName(post.content);

        if (!["video/mp4", "video/webm"].includes(videoTypes[filename]))
            throw new Error(`Missing video MIME type for ${filename}. Run encode-assets.py.`);
    }
}

function renderPost(post, author)
{
    const article = postTemplate.content.firstElementChild.cloneNode(true);
    const name = author.name.trim();
    const handle = author.handle.trim().replace(/^@/, "");
    const text = post.text.trim();
    const textElement = article.querySelector(".post-text");
    const dateElement = article.querySelector(".post-date");

    article.querySelector(".author-name").textContent = name;
    article.querySelector(".verified-badge").hidden = author.verified === false;
    article.querySelector(".author-handle").textContent = `@${handle}`;
    article.querySelector(".avatar-fallback").textContent = name.slice(0, 1).toUpperCase();
    textElement.textContent = text;
    textElement.hidden = !text;

    if (post.publishedAt)
    {
        const date = new Date(post.publishedAt);

        dateElement.dateTime = date.toISOString();
        dateElement.textContent = new Intl.DateTimeFormat("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric"
        }).format(date);
        dateElement.hidden = false;
        article.querySelector(".meta-divider").hidden = false;
    }

    postsRoot.appendChild(article);

    const entry = {
        article,
        filename: post.content,
        media: article.querySelector(".media"),
        video: article.querySelector("video"),
        status: article.querySelector(".media-status"),
        error: article.querySelector(".error-message"),
        loading: null
    };

    entry.video.addEventListener("play", () =>
    {
        for (const other of entries)
        {
            if (other !== entry && !other.video.paused)
                other.video.pause();
        }
    });

    entries.push(entry);

    return entry;
}

async function loadAvatars(resource, name)
{
    const bytes = await readEncodedAsset(resource.path);
    const url = assetBlobUrl(bytes, resource.mime);

    for (const entry of entries)
    {
        const avatar = entry.article.querySelector(".avatar");
        const fallback = entry.article.querySelector(".avatar-fallback");

        avatar.alt = `Avatar of ${name}`;
        avatar.onload = () =>
        {
            avatar.hidden = false;
            fallback.hidden = true;
        };
        avatar.onerror = () =>
        {
            avatar.hidden = true;
            fallback.hidden = false;
        };
        avatar.src = url;
    }
}

function getVideoUrl(filename, mime)
{
    if (!videoUrls.has(filename))
    {
        const task = readEncodedAsset(`assets/${filename}`)
            .then((bytes) => assetBlobUrl(bytes, mime))
            .catch((error) =>
            {
                videoUrls.delete(filename);
                throw error;
            });

        videoUrls.set(filename, task);
    }

    return videoUrls.get(filename);
}

async function attemptPlayback(video)
{
    video.muted = false;
    video.defaultMuted = false;

    try
    {
        await video.play();
    }
    catch (error)
    {
        if (error.name !== "NotAllowedError")
            throw error;
    }
}

function loadVideo(entry, mime, autoplay)
{
    if (entry.loading)
        return entry.loading;

    entry.loading = (async () =>
    {
        const url = await getVideoUrl(entry.filename, mime);

        await new Promise((resolve, reject) =>
        {
            entry.video.addEventListener("loadedmetadata", resolve, { once: true });
            entry.video.addEventListener("error", () => reject(new Error(`Could not decode video ${entry.filename}. Check the file format and codecs.`)), { once: true });
            entry.video.src = url;
            entry.video.load();
        });

        const width = entry.video.videoWidth;
        const height = entry.video.videoHeight;

        if (width > 0 && height > 0)
        {
            entry.media.style.setProperty("--video-aspect-ratio", `${width} / ${height}`);
            entry.media.dataset.orientation = height > width ? "portrait" : "landscape";
        }

        entry.status.hidden = true;

        if (autoplay)
            await attemptPlayback(entry.video);
    })().catch((error) =>
    {
        console.error(error);
        entry.status.textContent = "Could not load video.";
        entry.error.textContent = error.message;
        entry.error.hidden = false;
    });

    return entry.loading;
}

async function initialize()
{
    loadFooter().catch((error) =>
    {
        console.error(error);
        showPageError(`Footer: ${error.message}`);
    });

    try
    {
        const bytes = await readEncodedAsset(MANIFEST_PATH);
        const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

        validateManifest(manifest);

        document.title = String(manifest.siteTitle || manifest.author.name);

        for (const post of manifest.posts)
            renderPost(post, manifest.author);

        loadAvatars(manifest.assets.avatar, manifest.author.name).catch((error) =>
        {
            console.error(error);
            showPageError(error.message);
        });

        const first = entries[0];
        loadVideo(first, manifest.assets.videos[first.filename], true);

        if ("IntersectionObserver" in window)
        {
            const observer = new IntersectionObserver((observed) =>
            {
                for (const item of observed)
                {
                    if (!item.isIntersecting)
                        continue;

                    observer.unobserve(item.target);

                    const entry = entries.find((candidate) => candidate.media === item.target);

                    if (entry)
                        loadVideo(entry, manifest.assets.videos[entry.filename], false);
                }
            }, { rootMargin: "200px 0px" });

            for (const entry of entries.slice(1))
                observer.observe(entry.media);
        }
        else
        {
            for (const entry of entries.slice(1))
                loadVideo(entry, manifest.assets.videos[entry.filename], false);
        }
    }
    catch (error)
    {
        console.error(error);
        showPageError(error.message);
    }
}

window.addEventListener("pagehide", () =>
{
    for (const url of assetUrls)
        URL.revokeObjectURL(url);
});

initialize();
