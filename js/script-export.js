// ============================================
// EXPORT AS IMAGE
// A tier board, top list (capped at 10) or About me board can be saved
// as a PNG — not redrawn from scratch, but the real on-screen markup
// (same CSS classes, same rows/cards/covers) laid out in an off-screen
// container without the scrollbar or hover-only chrome, then rasterized
// with html2canvas. The current frame of the ambient pixel field is
// copied in as the backdrop, so it looks like a screenshot of the app
// rather than a separate rendering of the same data.
// ============================================
(function () {
    function download(canvas, filename) {
        canvas.toBlob((blob) => {
            if (!blob) {
                window.toast('Could not export — try again');
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        });
    }

    // The current frame of the animated background canvas, tiled behind
    // the poster the same way #pixelBg sits behind the whole page.
    function pixelFieldDataUrl() {
        try {
            return document.getElementById('pixelBg')?.toDataURL() || null;
        } catch {
            return null; // a tainted canvas here just means no backdrop, not a failed export
        }
    }

    // Wraps `innerNode` (built from the same markup functions the live
    // view uses) in a branded poster frame, renders it off-screen, and
    // downloads the result as `filename`.
    window.exportNodeAsPoster = async function ({ innerNode, width, title, subtitle, filename }) {
        if (typeof html2canvas !== 'function') {
            window.toast('Export isn’t available right now — try reloading the page');
            return;
        }

        const bg = pixelFieldDataUrl();
        const poster = document.createElement('div');
        poster.className = 'export-poster';
        if (bg) poster.style.backgroundImage = `url(${bg})`;
        poster.innerHTML = `
            <header class="export-poster__head">
                <img class="export-poster__logo" src="favicon.svg" alt="">
                <div>
                    <h1 class="export-poster__title">${window.escapeHtml(title)}</h1>
                    <p class="export-poster__subtitle">${window.escapeHtml(subtitle)}</p>
                </div>
            </header>
        `;
        poster.appendChild(innerNode);
        const footer = document.createElement('p');
        footer.className = 'export-poster__foot';
        footer.textContent = 'MADE WITH GAME VAULT';
        poster.appendChild(footer);

        const host = document.createElement('div');
        host.style.cssText = `position:fixed;top:0;left:-99999px;width:${width}px;pointer-events:none;`;
        host.appendChild(poster);
        document.body.appendChild(host);

        try {
            await document.fonts.ready;
            const canvas = await html2canvas(poster, {
                backgroundColor: '#05040c',
                scale: 2,
                useCORS: true,
                width,
                windowWidth: width
            });
            download(canvas, filename);
        } catch (error) {
            console.error(error);
            window.toast('Export failed — a custom image URL may have blocked it');
        } finally {
            host.remove();
        }
    };
})();
