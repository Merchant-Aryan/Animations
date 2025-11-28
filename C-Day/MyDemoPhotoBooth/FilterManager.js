// FilterManager.js
// Handles pixel-based filters for canvas1 using a global object


//Restore original image before applying a new filter
function resetToOriginal(ctx, width, height) {
    if (window.originalImageData) {
        ctx.putImageData(window.originalImageData, 0, 0);
    }
}




window.FilterManager = {
    applyGrayscale(ctx, width, height) {
        resetToOriginal(ctx, width, height);

        let imageData = ctx.getImageData(0, 0, width, height);
        let data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = data[i + 1] = data[i + 2] = avg;
        }

        
        ctx.putImageData(imageData, 0, 0);
    },

    applyBrighten(ctx, width, height, amount = 40) {
        resetToOriginal(ctx, width, height);

        let imageData = ctx.getImageData(0, 0, width, height);
        let data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] + amount);
            data[i + 1] = Math.min(255, data[i + 1] + amount);
            data[i + 2] = Math.min(255, data[i + 2] + amount);
        }

        ctx.putImageData(imageData, 0, 0);
    },

    applySepia(ctx, width, height) {
        let imageData = ctx.getImageData(0, 0, width, height);
        let data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            data[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
            data[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
            data[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
        }

        ctx.putImageData(imageData, 0, 0);
    },

    applyInvert(ctx, width, height) {
        resetToOriginal(ctx, width, height);
        let imageData = ctx.getImageData(0, 0, width, height);
        let data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
        }

        ctx.putImageData(imageData, 0, 0);
    },

    
    // Simple cartoon effect (posterization)
    applyCartoon(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            let avg = (data[i] + data[i + 1] + data[i + 2]) / 3;

            if (avg > 200) avg = 255;
            else if (avg > 150) avg = 200;
            else if (avg > 100) avg = 150;
            else if (avg > 50) avg = 100;
            else avg = 50;

            data[i] = data[i + 1] = data[i + 2] = avg;
        }

        ctx.putImageData(imageData, 0, 0);
    },

    applyEmojiOverlay(ctx, width, height) {

        resetToOriginal(ctx, width, height);
        // Circle of emojis
        const emojis = ["💜", "⭐", "✨", "🌸", "🦋", "💖", "🍒", "💫", "💜", "⭐", "✨", "🌸", "🦋", "💖", "🍒", "💫"];

        const count = 20;      // Number of emojis around the circle
        const radius = Math.min(width, height) * 0.60; // Circle radius (60% of image)

        // Center of image
        const cx = width / 2;
        const cy = height / 2;

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * 2 * Math.PI;   // Even spacing around circle

            // Position on circle
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);

            // Emoji size
            const size = Math.floor(Math.random() * 25) + 40; // 40–65px

            ctx.font = `${25}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Optional: rotate each emoji slightly for aesthetic look
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle + Math.PI / 2); // small rotation
            ctx.fillText(emojis[i % emojis.length], 0, 0);
            ctx.restore();
        }
    }
};