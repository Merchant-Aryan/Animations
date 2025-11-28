"use strict";

// ========== MAIN APPLICATION CODE ==========
// Note: Utility functions (initShaders, vec2, vec3, vec4, mat4, etc.) are now provided
// by the Common folder utilities loaded in PhotoBooth.html

// Box 1 Variables
let width = 320;
let height = 0;
let streaming = false;
let video, canvas1, photo, startCapture, allowCapture, clearCapture, stopCamera;
let sldrDiv, imgHeightSldr, imgWidthSldr, imgHeightSldrTxt, imgWidthSldrTxt;
let imghgt = 0, imgwid = 0;
let currentStream = null;

// Unified 3D Shape System Variables
let canvas2, gl1;
let currentShape = 'cube';
let shapeConfig = {
    type: 'cube',
    program: null,
    buffers: {},
    attributes: {},
    uniforms: {},
    points: [],
    colors: [],
    texCoords: [],
    pointCount: 0,
    rotationSpeed: 2.0,
    theta: 0.0,
    usesTexture: false,
    usesProjection: false,
    renderMode: 'triangles'
};

// Common variables
const texSize = 64;
const imgSize = 64;
const numChecks = 4;
const checkerImage = new Uint8Array(4 * imgSize * imgSize);
const texCoord = [vec2(0, 0), vec2(0, 1), vec2(1, 1), vec2(1, 0)];
const xAxis = 0, yAxis = 1, zAxis = 2;
let axis = xAxis;
let theta = [45.0, 45.0, 45.0];
let rotateOn = false;

// For shapes that use projection (sphere, etc.)
let modelViewMatrix, projectionMatrix;
let up = vec3(0.0, 1.0, 0.0);
const at = vec3(0.0, 0.0, 0.0);
let eye = vec3(0.0, 0.0, 1.0);
let theta2 = 0.0, phi2 = 0.0;
const near = -10, far = 10, left = -3.0, right = 3.0, ytop = 3.0, bottom = -3.0;
const latitudeBands = 30, longitudeBands = 30, sphereRadius = 2;
let hasTexture = false;

// Helper Functions
function updatePhotoFromCanvas() {
    if (!canvas1 || !photo) return;
    const dataURL = canvas1.toDataURL();
    photo.src = dataURL;
}

function updateTexturesFromCanvas() {
    if (!canvas1 || !gl1 || !shapeConfig.usesTexture || !shapeConfig.program) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function() {
        configureTexture(img, false);
        hasTexture = true;
        if (shapeConfig.uniforms.hasTexture) {
            gl1.useProgram(shapeConfig.program);
            gl1.uniform1i(shapeConfig.uniforms.hasTexture, true);
        }
    };
    img.onerror = () => console.error("Error loading texture from canvas");
    img.src = canvas1.toDataURL();
}

function applyFilter(filterFn, ...extraArgs) {
    if (!canvas1 || !canvas1.width || !canvas1.height) return;
    const ctx = canvas1.getContext("2d");
    const w = canvas1.width, h = canvas1.height;
    if (window.originalImageData) {
        ctx.putImageData(window.originalImageData, 0, 0);
    }
    filterFn(ctx, w, h, ...extraArgs);
    updatePhotoFromCanvas();
    updateTexturesFromCanvas();
}

// Camera Controls
function applyCameraFilters() {
    if (!video || !streaming) return;
    const zoom = parseFloat(document.getElementById('zoomControl').value);
    const brightness = parseInt(document.getElementById('brightnessControl').value);
    const contrast = parseInt(document.getElementById('contrastControl').value);
    const saturation = parseInt(document.getElementById('saturationControl').value);
    
    video.style.filter = `brightness(${100 + brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    video.style.transform = `scale(${zoom})`;
    video.style.transformOrigin = 'center center';
}

function stopCameraStream() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
        video.srcObject = null;
        streaming = false;
    }
}

// GIF Export Functions - Using CCapture.js for GIF format
let capturer = null;
let isCapturing = false;
let captureStartTime = 0;
let captureDuration = 0;
let targetCanvas = null;
let exportName = '';
let originalRotateOn = false;
let originalTheta = [0, 0, 0];
let originalTheta2 = 0;
let originalPhi2 = 0;
let statusDiv = null;
let captureTimeout = null;

function exportCanvasAsGif(canvas, name, duration = 10000, fps = 10) {
    console.log("exportCanvasAsGif called with:", { canvas, name, duration, fps });
    
    if (isCapturing) {
        alert("Please wait for current export to finish");
        return;
    }
    
    if (!canvas) {
        console.error("Canvas is null or undefined");
        alert("Error: Canvas not available");
        return;
    }
    
    // Check if CCapture library is loaded (works with both global script and module systems)
    const CCaptureClass = window.CCapture || (typeof CCapture !== 'undefined' ? CCapture : null);
    if (!CCaptureClass) {
        alert('CCapture library not loaded. Please ensure CCapture.all.min.js is loaded.');
        return;
    }
    
    isCapturing = true;
    targetCanvas = canvas;
    exportName = name;
    captureDuration = duration; // duration in milliseconds
    
    statusDiv = document.getElementById('exportStatus');
    statusDiv.className = 'alert alert-info';
    statusDiv.textContent = `Starting capture of ${name}...`;
    
    // Store original state
    originalRotateOn = rotateOn;
    originalTheta = [...theta];
    originalTheta2 = theta2;
    originalPhi2 = phi2;
    
    // Enable rotation for the target canvas
    if (canvas === canvas2) {
        rotateOn = true;
    }
    
    // First, try to fetch and create worker from blob to avoid CORS
    setupCCaptureWithBlobWorker(canvas, name, duration, fps);
}

async function setupCCaptureWithBlobWorker(canvas, name, duration, fps) {
    try {
        statusDiv.className = 'alert alert-info';
        statusDiv.textContent = `Setting up GIF capture for ${name}...`;
        
        // Ensure CCapture is available (works with both global script and module systems)
        const CCaptureClass = window.CCapture || (typeof CCapture !== 'undefined' ? CCapture : null);
        if (!CCaptureClass) {
            throw new Error('CCapture library not loaded. Please ensure CCapture.all.min.js is loaded.');
        }
        
        // Use local worker file (no CDN dependency)
        // gif.worker.js should be in the same directory as PhotoBooth.html
        const workersPath = './';
        
        // Create CCapture instance with local worker path
        // Explicitly set width and height to match canvas dimensions
        capturer = new CCaptureClass({
            format: 'gif',
            framerate: fps,
            verbose: true,
            name: exportName,
            workersPath: workersPath,
            width: canvas.width,  // Use full canvas width
            height: canvas.height  // Use full canvas height
        });
        
        // Start capturing
        capturer.start();
        captureStartTime = Date.now();
        
        statusDiv.className = 'alert alert-warning';
        statusDiv.textContent = `Recording ${name} as GIF... (${(duration/1000).toFixed(1)}s @ ${fps}fps)`;
        
        // Stop capturing after duration
        captureTimeout = setTimeout(() => {
            stopCapture();
        }, duration);
        
    } catch (error) {
        console.error("Error setting up CCapture:", error);
        statusDiv.className = 'alert alert-danger';
        statusDiv.textContent = `Error: ${error.message}. Please ensure both CCapture.all.min.js and gif.worker.js are in the same directory as PhotoBooth.html.`;
        isCapturing = false;
        capturer = null;
        cleanupCapture();
    }
}

function cleanupCapture() {
    isCapturing = false;
    rotateOn = originalRotateOn;
    theta = originalTheta;
    theta2 = originalTheta2;
    phi2 = originalPhi2;
    if (captureTimeout) {
        clearTimeout(captureTimeout);
        captureTimeout = null;
    }
}

function stopCapture() {
    if (!isCapturing || !capturer) return;
    
    try {
        capturer.stop();
        statusDiv.className = 'alert alert-warning';
        statusDiv.textContent = `Processing ${exportName}...`;
        capturer.save();
        statusDiv.className = 'alert alert-success';
        statusDiv.textContent = `${exportName} exported as GIF successfully!`;
    } catch (error) {
        console.error("Error stopping capture:", error);
        statusDiv.className = 'alert alert-danger';
        statusDiv.textContent = `Error saving: ${error.message}`;
    } finally {
        capturer = null;
        cleanupCapture();
    }
}


// Initialization
window.onload = function init() {
    // Box 1 Setup
    video = document.getElementById("video");
    canvas1 = document.getElementById("canvas1");
    photo = document.getElementById("photo");
    startCapture = document.getElementById("startcapture");
    allowCapture = document.getElementById("allowcapture");
    clearCapture = document.getElementById("clearcapture");
    stopCamera = document.getElementById("stopcamera");
    sldrDiv = document.getElementById("sldrdiv");
    imgHeightSldr = document.getElementById("imgheightsldr");
    imgWidthSldr = document.getElementById("imgwidthsldr");
    imgHeightSldrTxt = document.getElementById("imgheighttxt");
    imgWidthSldrTxt = document.getElementById("imgwidthtxt");

    // Camera controls
    const cameraControls = [
        { id: 'zoomControl', valueId: 'zoomValue', format: v => parseFloat(v).toFixed(1) + 'x' },
        { id: 'brightnessControl', valueId: 'brightnessValue', format: v => v },
        { id: 'contrastControl', valueId: 'contrastValue', format: v => v },
        { id: 'saturationControl', valueId: 'saturationValue', format: v => v }
    ];
    cameraControls.forEach(control => {
        document.getElementById(control.id).addEventListener('input', function(e) {
            document.getElementById(control.valueId).textContent = control.format(e.target.value);
            applyCameraFilters();
        });
    });

    startCapture.onclick = function(event) {
        takePicture();
        event.preventDefault();
    };

    clearCapture.onclick = function() {
        clrCapture();
    };

    stopCamera.onclick = function() {
        stopCameraStream();
    };

    // Photo upload from device
    const uploadPhotoBtn = document.getElementById("uploadPhotoBtn");
    const uploadPhotoInput = document.getElementById("uploadPhoto");
    
    uploadPhotoBtn.onclick = function() {
        uploadPhotoInput.click();
    };
    
    uploadPhotoInput.addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            loadImageFromFile(file);
        } else {
            alert("Please select a valid image file.");
        }
    });

    allowCapture.addEventListener("click", function() {
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                }
                currentStream = stream;
                video.srcObject = stream;
                video.play();
            })
            .catch((err) => {
                console.error("Camera error:", err);
                alert("Unable to access camera. Please check permissions.");
            });
    });

    video.addEventListener("canplay", function() {
        if (!streaming) {
            height = video.videoHeight / (video.videoWidth / width);
            video.setAttribute("width", width);
            video.setAttribute("height", height);
            canvas1.setAttribute("width", width);
            canvas1.setAttribute("height", height);
            streaming = true;
        }
    });

    document.getElementById("imgheightsldr").oninput = function(event) {
        if (imgHeightSldr.max > 0) {
            const rect = sldrDiv.getBoundingClientRect();
            const topPos = rect.top;
            const leftPos = rect.left;
            photo.height = imghgt = Number(event.target.value);
            photo.style.left = (leftPos + 1 + (width - imgwid) / 2) + "px";
            photo.style.top = (window.scrollY + topPos + 1 + (height - imghgt) / 2) + "px";
            imgHeightSldrTxt.innerText = imghgt.toString();
        }
    };

    document.getElementById("imgwidthsldr").oninput = function(event) {
        if (imgWidthSldr.max > 0) {
            const rect = sldrDiv.getBoundingClientRect();
            const topPos = rect.top;
            const leftPos = rect.left;
            photo.width = imgwid = Number(event.target.value);
            photo.style.left = (leftPos + 1 + (width - imgwid) / 2) + "px";
            photo.style.top = (window.scrollY + topPos + 1 + (height - imghgt) / 2) + "px";
            imgWidthSldrTxt.innerText = imgwid.toString();
        }
    };

    clearPhoto();

    // Unified 3D Shape Setup
    canvas2 = document.getElementById("canvas2");
    gl1 = canvas2.getContext('webgl2', {});
    if (!gl1) { alert("WebGL2 is unavailable"); }

    gl1.viewport(0, 0, canvas2.width, canvas2.height);
    gl1.clearColor(1.0, 1.0, 1.0, 1.0);
    gl1.enable(gl1.DEPTH_TEST);

    // Initialize checker texture
    for (let i = 0; i < imgSize; i++) {
        for (let j = 0; j < imgSize; j++) {
            const patchx = Math.floor(i / (imgSize / numChecks));
            const patchy = Math.floor(j / (imgSize / numChecks));
            const c = (patchx % 2 ^ patchy % 2) ? 255 : 0;
            const idx = 4 * i * imgSize + 4 * j;
            checkerImage[idx] = c;
            checkerImage[idx + 1] = c;
            checkerImage[idx + 2] = c;
            checkerImage[idx + 3] = 255;
        }
    }

    // Initialize with default shape (cube)
    initializeShape('cube');

    // Shape selector
    const shapeSelector = document.getElementById("shapeSelector");
    if (shapeSelector) {
        // Set default selection to cube
        shapeSelector.value = 'cube';
        shapeSelector.onchange = function() {
            const newShape = this.value;
            initializeShape(newShape);
            updateShapeInstructions(newShape);
        };
        // Update instructions for cube
        updateShapeInstructions('cube');
    }

    // Rotation controls
    document.getElementById("rotatex").onclick = function() { axis = xAxis; };
    document.getElementById("rotatey").onclick = function() { axis = yAxis; };
    document.getElementById("rotatez").onclick = function() { axis = zAxis; };
    document.getElementById("togglerot").onclick = function() { rotateOn = !rotateOn; };

    // Keyboard controls for sphere
    document.addEventListener("keydown", function(event) {
        let keyCode = 0;
        if (event.key != null && event.key.length > 0) {
            switch (event.key) {
                case "ArrowLeft": keyCode = 37; break;
                case "ArrowUp": keyCode = 38; break;
                case "ArrowRight": keyCode = 39; break;
                case "ArrowDown": keyCode = 40; break;
                default:
                    keyCode = (event.key.length > 1) ? 0 : event.key.toUpperCase().charCodeAt(0);
            }
        }
        if (currentShape === 'sphere') {
            if (keyCode === 65 || keyCode === 37) { theta2 += 0.1; }
            if (keyCode === 68 || keyCode === 39) { theta2 -= 0.1; }
            if (keyCode === 87 || keyCode === 38) { phi2 += 0.1; }
            if (keyCode === 83 || keyCode === 40) { phi2 -= 0.1; }
        }
    }, false);
    
    // Export Shape as GIF button
    const exportShapeGifBtn = document.getElementById("exportShapeGif");
    if (exportShapeGifBtn) {
        exportShapeGifBtn.onclick = function(e) {
            e.preventDefault();
            const shapeName = currentShape.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (!canvas2) {
                alert("Error: Canvas not initialized. Please refresh the page.");
                return;
            }
            if (typeof exportCanvasAsGif !== 'function') {
                alert("Error: Export function not available. Please refresh the page.");
                return;
            }
            exportCanvasAsGif(canvas2, `rotating_${currentShape}`, 10000, 20);
        };
    }

    // Filter Buttons
    document.getElementById("normalBtn").onclick = () => {
        const ctx = canvas1.getContext("2d");
        const w = canvas1.width, h = canvas1.height;
        if (window.resetToOriginal) {
            window.resetToOriginal(ctx, w, h);
        } else if (window.originalImageData) {
            ctx.putImageData(window.originalImageData, 0, 0);
        }
        updatePhotoFromCanvas();
        updateTexturesFromCanvas();
    };

    document.getElementById("grayscaleBtn").onclick = () => applyFilter(window.FilterManager.applyGrayscale);
    document.getElementById("brightenBtn").onclick = () => applyFilter(window.FilterManager.applyBrighten, 40);
    document.getElementById("sepiaBtn").onclick = () => applyFilter(window.FilterManager.applySepia);
    document.getElementById("invertBtn").onclick = () => applyFilter(window.FilterManager.applyInvert);
    document.getElementById("cartoonBtn").onclick = () => applyFilter(window.FilterManager.applyCartoon);
    document.getElementById("emojiOverlayBtn").onclick = () => applyFilter(window.FilterManager.applyEmojiOverlay);

    render();
};

// Box 1 Functions
function clearPhoto() {
    const context = canvas1.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas1.width, canvas1.height);
    updatePhotoFromCanvas();
    sldrDiv.style.height = (video.offsetHeight - 2) + "px";
}

function takePicture() {
    const context = canvas1.getContext("2d");
    if (width && height) {
        canvas1.width = width;
        canvas1.height = height;
        context.drawImage(video, 0, 0, width, height);
        window.originalImageData = context.getImageData(0, 0, width, height);
        hasTexture = true; // Mark that we have a photo to wrap
        updatePhotoFromCanvas();
        imgHeightSldr.max = height;
        imgHeightSldr.value = height;
        imgHeightSldrTxt.innerText = height.toString();
        imgWidthSldr.max = width;
        imgWidthSldr.value = width;
        imgWidthSldrTxt.innerText = width.toString();
        imghgt = height;
        imgwid = width;
        photo.height = height;
        photo.width = width;
        sldrDiv.style.height = height + "px";
        const rect = sldrDiv.getBoundingClientRect();
        photo.style.left = rect.left + 1 + "px";
        photo.style.top = window.scrollY + rect.top + 1 + "px";
            updateTexturesFromCanvas();
    } else {
        clrCapture();
    }
}

function loadImageFromFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const img = new Image();
        
        img.onload = function() {
            // Calculate dimensions to fit while maintaining aspect ratio
            let imgWidth = img.width;
            let imgHeight = img.height;
            
            // Scale to fit within reasonable bounds (max 1920px width)
            const maxWidth = 1920;
            if (imgWidth > maxWidth) {
                const scale = maxWidth / imgWidth;
                imgWidth = maxWidth;
                imgHeight = imgHeight * scale;
            }
            
            // Update global width and height
            width = imgWidth;
            height = imgHeight;
            
            // Set canvas dimensions
            canvas1.width = imgWidth;
            canvas1.height = imgHeight;
            
            // Draw image to canvas
            const context = canvas1.getContext("2d");
            context.drawImage(img, 0, 0, imgWidth, imgHeight);
            
            // Store original image data for filters
            window.originalImageData = context.getImageData(0, 0, imgWidth, imgHeight);
            hasTexture = true; // Mark that we have a photo to wrap
            
            // Update photo display
            updatePhotoFromCanvas();
            
            // Update sliders
            imgHeightSldr.max = imgHeight;
            imgHeightSldr.value = imgHeight;
            imgHeightSldrTxt.innerText = imgHeight.toString();
            imgWidthSldr.max = imgWidth;
            imgWidthSldr.value = imgWidth;
            imgWidthSldrTxt.innerText = imgWidth.toString();
            
            // Update dimensions
            imghgt = imgHeight;
            imgwid = imgWidth;
            photo.height = imgHeight;
            photo.width = imgWidth;
            sldrDiv.style.height = imgHeight + "px";
            
            // Position photo
            const rect = sldrDiv.getBoundingClientRect();
            photo.style.left = rect.left + 1 + "px";
            photo.style.top = window.scrollY + rect.top + 1 + "px";
            
            // Update textures for 3D shapes
            updateTexturesFromCanvas();
            
            console.log("Image loaded successfully:", file.name);
        };
        
        img.onerror = function() {
            alert("Error loading image. Please try a different file.");
        };
        
        img.src = e.target.result;
    };
    
    reader.onerror = function() {
        alert("Error reading file. Please try again.");
    };
    
    reader.readAsDataURL(file);
}

function clrCapture() {
    clearPhoto();
    imgHeightSldr.max = 0;
    imgHeightSldr.value = 0;
    imgHeightSldrTxt.innerText = "0";
    imgWidthSldr.max = 0;
    imgWidthSldr.value = 0;
    imgWidthSldrTxt.innerText = "0";
    imghgt = 0;
    imgwid = 0;
    configureTexture(checkerImage, true);
    hasTexture = false;
    if (gl1 && shapeConfig.program && shapeConfig.uniforms.hasTexture) {
        gl1.useProgram(shapeConfig.program);
        gl1.uniform1i(shapeConfig.uniforms.hasTexture, false);
    }
}

// Texture Configuration
function configureTexture(image, isBitMap) {
    if (!gl1 || !shapeConfig.program) return;
    
    gl1.useProgram(shapeConfig.program);
    const texture = gl1.createTexture();
    gl1.bindTexture(gl1.TEXTURE_2D, texture);
    gl1.pixelStorei(gl1.UNPACK_FLIP_Y_WEBGL, true);
    
    if (isBitMap) {
        gl1.texImage2D(gl1.TEXTURE_2D, 0, gl1.RGBA, texSize, texSize, 0, gl1.RGBA, gl1.UNSIGNED_BYTE, image);
    } else {
        gl1.texImage2D(gl1.TEXTURE_2D, 0, gl1.RGBA, gl1.RGBA, gl1.UNSIGNED_BYTE, image);
    }
    gl1.generateMipmap(gl1.TEXTURE_2D);
    gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_MIN_FILTER, gl1.NEAREST_MIPMAP_LINEAR);
    gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_MAG_FILTER, gl1.NEAREST);
    
    const textureLoc = gl1.getUniformLocation(shapeConfig.program, "sampTexture");
    if (textureLoc !== null) {
        gl1.activeTexture(gl1.TEXTURE0);
        gl1.uniform1i(textureLoc, 0);
    }
}


// Shape Initialization Function
function initializeShape(shapeType) {
    currentShape = shapeType;
    shapeConfig.type = shapeType;
    shapeConfig.points = [];
    shapeConfig.colors = [];
    shapeConfig.texCoords = [];
    shapeConfig.pointCount = 0;
    shapeConfig.theta = 0.0;
    shapeConfig.attributes = {};
    shapeConfig.uniforms = {};

    if (shapeConfig.buffers?.vertex) {
        gl1.deleteBuffer(shapeConfig.buffers.vertex);
    }
    if (shapeConfig.buffers?.color) {
        gl1.deleteBuffer(shapeConfig.buffers.color);
    }
    if (shapeConfig.buffers?.texCoord) {
        gl1.deleteBuffer(shapeConfig.buffers.texCoord);
    }
    shapeConfig.buffers = {};

    switch(shapeType) {
        case 'cube':
        case 'cube_fast':
            initializeCube(shapeType === 'cube_fast');
            break;
        case 'sphere':
            initializeSphere();
            break;
        case 'tetrahedron':
        case 'octahedron':
            initializePolyhedron(shapeType);
            break;
        case 'polyhedron':
            initializeObjModel(shapeType);
            break;
        default:
            initializeCube(false);
    }

    setupShapeBuffers();
    
    // Verify buffers were created (especially important for sphere)
    if (currentShape === 'sphere') {
        if (!shapeConfig.buffers.vertex || !shapeConfig.buffers.texCoord) {
            console.error("Sphere initialization failed: missing buffers", {
                hasVertex: !!shapeConfig.buffers.vertex,
                hasTexCoord: !!shapeConfig.buffers.texCoord,
                points: shapeConfig.points.length,
                texCoords: shapeConfig.texCoords.length,
                pointCount: shapeConfig.pointCount
            });
        }
    }
    
    if (hasTexture && canvas1 && canvas1.width > 0 && window.originalImageData) {
        setTimeout(() => updateTexturesFromCanvas(), 50);
    }
}

// Initialize Cube
function initializeCube(isFast) {
    shapeConfig.program = initShaders(gl1, "vertex-shader1", "fragment-shader1");
    gl1.useProgram(shapeConfig.program);
    
    shapeConfig.rotationSpeed = isFast ? 10.0 : 2.0;
    shapeConfig.usesTexture = true;
    shapeConfig.usesProjection = false;
    shapeConfig.renderMode = 'triangles';
    
    const vertices = [
        vec4(-0.5, -0.5, 0.5, 1.0), vec4(-0.5, 0.5, 0.5, 1.0),
        vec4(0.5, 0.5, 0.5, 1.0), vec4(0.5, -0.5, 0.5, 1.0),
        vec4(-0.5, -0.5, -0.5, 1.0), vec4(-0.5, 0.5, -0.5, 1.0),
        vec4(0.5, 0.5, -0.5, 1.0), vec4(0.5, -0.5, -0.5, 1.0)
    ];
    const vertexColors = [
        vec4(1.0, 0.0, 1.0, 1.0), vec4(0.0, 0.0, 0.0, 1.0),
        vec4(0.0, 1.0, 0.0, 1.0), vec4(0.0, 1.0, 1.0, 1.0),
        vec4(1.0, 1.0, 0.0, 1.0), vec4(0.0, 0.0, 1.0, 1.0),
        vec4(1.0, 1.0, 1.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0)
    ];
    
    function quad(a, b, c, d) {
        const color = vertexColors[c];
        shapeConfig.points.push(vertices[a], vertices[b], vertices[c], vertices[a], vertices[c], vertices[d]);
        shapeConfig.colors.push(color, color, color, color, color, color);
        shapeConfig.texCoords.push(texCoord[0], texCoord[1], texCoord[2], texCoord[0], texCoord[2], texCoord[3]);
        shapeConfig.pointCount += 6;
    }
    
    quad(1, 0, 3, 2); quad(2, 3, 7, 6); quad(3, 0, 4, 7);
    quad(5, 1, 2, 6); quad(4, 5, 6, 7); quad(5, 4, 0, 1);
    
    shapeConfig.uniforms.theta = gl1.getUniformLocation(shapeConfig.program, "theta");
    if (shapeConfig.uniforms.theta) {
        gl1.uniform3fv(shapeConfig.uniforms.theta, theta);
    }
    configureTexture(checkerImage, true);
    if (hasTexture && canvas1 && canvas1.width > 0 && window.originalImageData) {
        updateTexturesFromCanvas();
    }
}

// Initialize Sphere (using Draft's triangle-based implementation)
function initializeSphere() {
    for (let i = 0; i < 4; i++) gl1.disableVertexAttribArray(i);
    
    shapeConfig.program = initShaders(gl1, "vertex-shader2", "fragment-shader2");
    if (!shapeConfig.program || shapeConfig.program === -1) {
        console.error("Failed to initialize sphere shader program");
        return;
    }
    gl1.useProgram(shapeConfig.program);
    
    shapeConfig.usesTexture = true;
    shapeConfig.usesProjection = true;
    shapeConfig.renderMode = 'triangles';
    shapeConfig.rotationSpeed = 0.1;
    theta2 = phi2 = 0.0;
    shapeConfig.points = [];
    shapeConfig.texCoords = [];
    shapeConfig.pointCount = 0;
    
    let phi1, phi2_local, sinPhi1, sinPhi2, cosPhi1, cosPhi2;
    let theta1, theta2_local, sinTheta1, sinTheta2, cosTheta1, cosTheta2;
    let p1, p2, p3, p4;
    let u1, u2, v1, v2, uv1, uv2, uv3, uv4;
    const r = sphereRadius;

    for (let latNumber = 1; latNumber <= latitudeBands; latNumber++) {
        phi1 = Math.PI * (latNumber - 1) / latitudeBands;
        sinPhi1 = Math.sin(phi1);
        cosPhi1 = Math.cos(phi1);
        phi2_local = Math.PI * latNumber / latitudeBands;
        sinPhi2 = Math.sin(phi2_local);
        cosPhi2 = Math.cos(phi2_local);

        for (let longNumber = 1; longNumber <= longitudeBands; longNumber++) {
            theta1 = 2 * Math.PI * (longNumber - 1) / longitudeBands;
            sinTheta1 = Math.sin(theta1);
            cosTheta1 = Math.cos(theta1);
            theta2_local = 2 * Math.PI * longNumber / longitudeBands;
            sinTheta2 = Math.sin(theta2_local);
            cosTheta2 = Math.cos(theta2_local);

            p1 = vec4(cosTheta1 * sinPhi1 * r, cosPhi1 * r, sinTheta1 * sinPhi1 * r, 1.0);
            p2 = vec4(cosTheta2 * sinPhi1 * r, cosPhi1 * r, sinTheta2 * sinPhi1 * r, 1.0);
            p3 = vec4(cosTheta1 * sinPhi2 * r, cosPhi2 * r, sinTheta1 * sinPhi2 * r, 1.0);
            p4 = vec4(cosTheta2 * sinPhi2 * r, cosPhi2 * r, sinTheta2 * sinPhi2 * r, 1.0);

            shapeConfig.points.push(p1, p2, p3, p2, p4, p3);
            shapeConfig.pointCount += 6;

            u1 = 1 - ((longNumber - 1) / longitudeBands);
            u2 = 1 - (longNumber / longitudeBands);
            v1 = 1 - ((latNumber - 1) / latitudeBands);
            v2 = 1 - (latNumber / latitudeBands);

            uv1 = vec2(u1, v1);
            uv2 = vec2(u2, v1);
            uv3 = vec2(u1, v2);
            uv4 = vec2(u2, v2);

            shapeConfig.texCoords.push(uv1, uv2, uv3, uv2, uv4, uv3);
        }
    }
    
    shapeConfig.uniforms.modelViewMatrix = gl1.getUniformLocation(shapeConfig.program, "modelViewMatrix");
    shapeConfig.uniforms.projectionMatrix = gl1.getUniformLocation(shapeConfig.program, "projectionMatrix");
    shapeConfig.uniforms.useBlack = gl1.getUniformLocation(shapeConfig.program, "useBlack");
    shapeConfig.uniforms.hasTexture = gl1.getUniformLocation(shapeConfig.program, "hasTexture");
    
    projectionMatrix = ortho(left, right, bottom, ytop, near, far);
    if (shapeConfig.uniforms.projectionMatrix) {
        gl1.uniformMatrix4fv(shapeConfig.uniforms.projectionMatrix, false, flatten(projectionMatrix));
    }
    if (shapeConfig.uniforms.useBlack) {
        gl1.uniform1i(shapeConfig.uniforms.useBlack, false);
    }
    if (shapeConfig.uniforms.hasTexture) {
        gl1.uniform1i(shapeConfig.uniforms.hasTexture, false);
    }
    
    eye = vec3(sphereRadius * Math.sin(theta2) * Math.cos(phi2),
        sphereRadius * Math.sin(phi2),
        sphereRadius * Math.cos(theta2) * Math.cos(phi2));
    modelViewMatrix = lookAt(eye, at, up);
    if (shapeConfig.uniforms.modelViewMatrix) {
        gl1.uniformMatrix4fv(shapeConfig.uniforms.modelViewMatrix, false, flatten(modelViewMatrix));
    }
}

// Initialize Tetrahedron or Octahedron
function initializePolyhedron(type) {
    shapeConfig.program = initShaders(gl1, "vertex-shader1", "fragment-shader1");
    gl1.useProgram(shapeConfig.program);
    
    shapeConfig.rotationSpeed = 2.0;
    shapeConfig.usesTexture = true;
    shapeConfig.usesProjection = false;
    shapeConfig.renderMode = 'triangles';
    
    const scaleFactor = 1.8;
    
    if (type === 'tetrahedron') {
        const verticesT = [
            vec3(0.0000, 0.0000, -0.3500 * scaleFactor),
            vec3(0.0000, 0.3500 * scaleFactor, 0.1500 * scaleFactor),
            vec3(-0.3500 * scaleFactor, -0.1500 * scaleFactor, 0.1500 * scaleFactor),
            vec3(0.3500 * scaleFactor, -0.1500 * scaleFactor, 0.1500 * scaleFactor)
        ];
        
                function makeTetra(a, b, c, color) {
            const baseColor = vec4(1.0, 1.0, 1.0, 1.0);
            const texCoords = [vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.5, 1.0)];
            
            shapeConfig.colors.push(baseColor, baseColor, baseColor);
            shapeConfig.points.push(vec4(a[0], a[1], a[2], 1.0), vec4(b[0], b[1], b[2], 1.0), vec4(c[0], c[1], c[2], 1.0));
            shapeConfig.texCoords.push(texCoords[0], texCoords[1], texCoords[2]);
            shapeConfig.pointCount += 3;
        }
        
        function tetra(p, q, r, s) {
            makeTetra(p, r, q, 0);
            makeTetra(p, r, s, 1);
            makeTetra(p, q, s, 2);
            makeTetra(q, r, s, 3);
        }
        
        tetra(verticesT[0], verticesT[1], verticesT[2], verticesT[3]);
        
        configureTexture(checkerImage, true);
        if (hasTexture) updateTexturesFromCanvas();
    } else if (type === 'octahedron') {
        const verticesO = [
            vec3(0.2000 * scaleFactor, 0.0000, -0.2000 * scaleFactor),
            vec3(-0.2000 * scaleFactor, 0.0000, -0.2000 * scaleFactor),
            vec3(-0.2000 * scaleFactor, 0.0000, 0.2000 * scaleFactor),
            vec3(0.2000 * scaleFactor, 0.0000, 0.2000 * scaleFactor),
            vec3(0.0000, 0.3000 * scaleFactor, 0.0000),
            vec3(0.0000, -0.3000 * scaleFactor, 0.0000)
        ];
        
        function makeOcta(a, b, c, color) {
            const baseColor = vec4(1.0, 1.0, 1.0, 1.0);
            const texCoords = [vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.5, 1.0)];
            
            shapeConfig.colors.push(baseColor, baseColor, baseColor);
            shapeConfig.points.push(vec4(a[0], a[1], a[2], 1.0), vec4(b[0], b[1], b[2], 1.0), vec4(c[0], c[1], c[2], 1.0));
            shapeConfig.texCoords.push(texCoords[0], texCoords[1], texCoords[2]);
            shapeConfig.pointCount += 3;
        }
        
        function octa(a, b, c, d, e, f) {
            makeOcta(a, d, e, 0);
            makeOcta(a, b, e, 1);
            makeOcta(b, c, e, 0);
            makeOcta(c, d, e, 1);
            makeOcta(a, d, f, 1);
            makeOcta(a, b, f, 2);
            makeOcta(b, c, f, 1);
            makeOcta(c, d, f, 2);
        }
        
        octa(verticesO[0], verticesO[1], verticesO[2], verticesO[3], verticesO[4], verticesO[5]);
    }
    
    shapeConfig.uniforms.theta = gl1.getUniformLocation(shapeConfig.program, "theta");
    if (shapeConfig.uniforms.theta) {
        gl1.uniform3fv(shapeConfig.uniforms.theta, theta);
    }
}

// Initialize Rotating Square (from Module1_Assignment2)
// Initialize OBJ Models (Polyhedron)
function initializeObjModel(type) {
    shapeConfig.program = initShaders(gl1, "vertex-shader1", "fragment-shader1");
    gl1.useProgram(shapeConfig.program);
    
    shapeConfig.rotationSpeed = 2.0;
    shapeConfig.usesTexture = true;
    shapeConfig.usesProjection = false;
    shapeConfig.renderMode = 'triangles';
    
    let objData = type === 'polyhedron' ? filedata1 : '';
    
    if (objData) {
        const lines = objData.split('\n');
        const vertices = [];
        const faces = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('v ')) {
                const parts = line.split(/\s+/);
                if (parts.length >= 4) {
                    vertices.push([
                        parseFloat(parts[1]),
                        parseFloat(parts[2]),
                        parseFloat(parts[3])
                    ]);
                }
            } else if (line.startsWith('f ')) {
                const parts = line.split(/\s+/);
                if (parts.length >= 4) {
                    const face = [];
                    for (let j = 1; j < parts.length; j++) {
                        const idx = parseInt(parts[j].split('/')[0]) - 1;
                        if (idx >= 0 && idx < vertices.length) {
                            face.push(idx);
                        }
                    }
                    if (face.length >= 3) {
                        faces.push(face);
                    }
                }
            }
        }
        
        let maxDim = 0;
        for (let v of vertices) {
            maxDim = Math.max(maxDim, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
        }
        const scale = maxDim > 0 ? 1.0 / maxDim : 1.0;
        const color = vec4(1.0, 1.0, 1.0, 1.0);
        for (let face of faces) {
            if (face.length >= 3) {
                for (let i = 1; i < face.length - 1; i++) {
                    const v0 = vertices[face[0]];
                    const v1 = vertices[face[i]];
                    const v2 = vertices[face[i + 1]];
                    
                    shapeConfig.colors.push(color, color, color);
                    shapeConfig.points.push(
                        vec4(v0[0] * scale, v0[1] * scale, v0[2] * scale, 1.0),
                        vec4(v1[0] * scale, v1[1] * scale, v1[2] * scale, 1.0),
                        vec4(v2[0] * scale, v2[1] * scale, v2[2] * scale, 1.0)
                    );
                    shapeConfig.texCoords.push(vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.5, 1.0));
                    shapeConfig.pointCount += 3;
                }
            }
        }
        
    }
    
    shapeConfig.uniforms.theta = gl1.getUniformLocation(shapeConfig.program, "theta");
    if (shapeConfig.uniforms.theta) {
        gl1.uniform3fv(shapeConfig.uniforms.theta, theta);
    }
}

// Setup Buffers for Current Shape
function setupShapeBuffers() {
    if (!shapeConfig.program) {
        console.error("setupShapeBuffers: shapeConfig.program is null for shape:", currentShape);
        return;
    }
    
    for (let i = 0; i < 10; i++) gl1.disableVertexAttribArray(i);
    gl1.useProgram(shapeConfig.program);
    
    if (shapeConfig.points.length > 0) {
        shapeConfig.buffers.vertex = gl1.createBuffer();
        gl1.bindBuffer(gl1.ARRAY_BUFFER, shapeConfig.buffers.vertex);
        gl1.bufferData(gl1.ARRAY_BUFFER, flatten(shapeConfig.points), gl1.STATIC_DRAW);
        shapeConfig.attributes.position = gl1.getAttribLocation(shapeConfig.program, "vPosition");
        if (shapeConfig.attributes.position >= 0) {
            gl1.vertexAttribPointer(shapeConfig.attributes.position, 4, gl1.FLOAT, false, 0, 0);
            gl1.enableVertexAttribArray(shapeConfig.attributes.position);
        }
    }
    
    if (shapeConfig.colors.length > 0) {
        shapeConfig.buffers.color = gl1.createBuffer();
        gl1.bindBuffer(gl1.ARRAY_BUFFER, shapeConfig.buffers.color);
        gl1.bufferData(gl1.ARRAY_BUFFER, flatten(shapeConfig.colors), gl1.STATIC_DRAW);
        shapeConfig.attributes.color = gl1.getAttribLocation(shapeConfig.program, "vColor");
        if (shapeConfig.attributes.color >= 0) {
            gl1.vertexAttribPointer(shapeConfig.attributes.color, 4, gl1.FLOAT, false, 0, 0);
            gl1.enableVertexAttribArray(shapeConfig.attributes.color);
        }
    }
    
    if (shapeConfig.texCoords.length > 0) {
        shapeConfig.buffers.texCoord = gl1.createBuffer();
        gl1.bindBuffer(gl1.ARRAY_BUFFER, shapeConfig.buffers.texCoord);
        gl1.bufferData(gl1.ARRAY_BUFFER, flatten(shapeConfig.texCoords), gl1.STATIC_DRAW);
        shapeConfig.attributes.texCoord = gl1.getAttribLocation(shapeConfig.program, "vTexCoord");
        if (shapeConfig.attributes.texCoord >= 0) {
            gl1.vertexAttribPointer(shapeConfig.attributes.texCoord, 2, gl1.FLOAT, false, 0, 0);
            gl1.enableVertexAttribArray(shapeConfig.attributes.texCoord);
        }
    } else if (currentShape === 'sphere') {
        console.error("setupShapeBuffers: Sphere requires texture coordinates but none were provided");
    }
    
    if (shapeConfig.usesTexture) {
        configureTexture(checkerImage, true);
        if (hasTexture && canvas1 && canvas1.width > 0 && window.originalImageData) {
            setTimeout(() => updateTexturesFromCanvas(), 50);
        }
    }
}

// Update Shape Instructions
function updateShapeInstructions(shapeType) {
    const instructionsEl = document.getElementById("shapeInstructions");
    if (!instructionsEl) return;
    
    switch(shapeType) {
        case 'sphere':
            instructionsEl.textContent = "Use Arrow Keys or WASD to rotate";
            break;
        case 'tetrahedron':
        case 'octahedron':
        case 'cube':
        case 'cube_fast':
            instructionsEl.textContent = "Use Rotate X/Y/Z buttons and Toggle Auto-Rotate";
            break;
        default:
            instructionsEl.textContent = "Use controls to interact with shape";
    }
}

// Render Loop
function render() {
    if (!shapeConfig.program) {
        requestAnimFrame(render);
        return;
    }
    
    gl1.useProgram(shapeConfig.program);
    gl1.clear(gl1.COLOR_BUFFER_BIT | gl1.DEPTH_BUFFER_BIT);

    const hasVertexBuffer = shapeConfig.buffers?.vertex && shapeConfig.attributes?.position >= 0;
    const hasTexCoordBuffer = shapeConfig.buffers?.texCoord && shapeConfig.attributes?.texCoord >= 0;
    const hasColorBuffer = shapeConfig.buffers?.color && shapeConfig.attributes?.color >= 0;
    
    if (currentShape === 'sphere' ? (!hasVertexBuffer || !hasTexCoordBuffer) : !hasVertexBuffer) {
        requestAnimFrame(render);
        return;
    }
    
    if (hasVertexBuffer) {
        gl1.bindBuffer(gl1.ARRAY_BUFFER, shapeConfig.buffers.vertex);
        gl1.vertexAttribPointer(shapeConfig.attributes.position, 4, gl1.FLOAT, false, 0, 0);
        gl1.enableVertexAttribArray(shapeConfig.attributes.position);
    }
    
    if (hasColorBuffer) {
        gl1.bindBuffer(gl1.ARRAY_BUFFER, shapeConfig.buffers.color);
        gl1.vertexAttribPointer(shapeConfig.attributes.color, 4, gl1.FLOAT, false, 0, 0);
        gl1.enableVertexAttribArray(shapeConfig.attributes.color);
    }
    
    if (hasTexCoordBuffer) {
        gl1.bindBuffer(gl1.ARRAY_BUFFER, shapeConfig.buffers.texCoord);
        gl1.vertexAttribPointer(shapeConfig.attributes.texCoord, 2, gl1.FLOAT, false, 0, 0);
        gl1.enableVertexAttribArray(shapeConfig.attributes.texCoord);
    }

    // Handle rotation and projection based on shape type
    if (shapeConfig.usesProjection) {
        if (currentShape === 'sphere' && isCapturing && targetCanvas === canvas2) {
            theta2 += 0.1;
        }
        
        // Normalize angles
        if (theta2 > 2 * Math.PI) theta2 -= 2 * Math.PI;
        if (theta2 < 0) theta2 += 2 * Math.PI;
        if (phi2 > 2 * Math.PI) phi2 -= 2 * Math.PI;
        if (phi2 < 0) phi2 += 2 * Math.PI;

        up = (phi2 >= Math.PI / 2 && phi2 < 3 * Math.PI / 2) ? vec3(0.0, -1.0, 0.0) : vec3(0.0, 1.0, 0.0);
        eye = vec3(sphereRadius * Math.sin(theta2) * Math.cos(phi2),
            sphereRadius * Math.sin(phi2),
            sphereRadius * Math.cos(theta2) * Math.cos(phi2));

        modelViewMatrix = lookAt(eye, at, up);
        projectionMatrix = ortho(left, right, bottom, ytop, near, far);

        if (shapeConfig.uniforms.modelViewMatrix) {
            gl1.uniformMatrix4fv(shapeConfig.uniforms.modelViewMatrix, false, flatten(modelViewMatrix));
        }
        if (shapeConfig.uniforms.projectionMatrix) {
            gl1.uniformMatrix4fv(shapeConfig.uniforms.projectionMatrix, false, flatten(projectionMatrix));
        }
        if (shapeConfig.uniforms.useBlack) {
            gl1.uniform1i(shapeConfig.uniforms.useBlack, !hasTexture);
        }
        if (shapeConfig.uniforms.hasTexture) {
            gl1.uniform1i(shapeConfig.uniforms.hasTexture, hasTexture);
        }
    } else if (shapeConfig.uniforms?.theta && rotateOn) {
        theta[axis] += shapeConfig.rotationSpeed;
        gl1.uniform3fv(shapeConfig.uniforms.theta, theta);
    }

    if (!shapeConfig.pointCount) {
        requestAnimFrame(render);
        return;
    }
    
    const drawMode = shapeConfig.renderMode === 'triangles' ? gl1.TRIANGLES :
                     shapeConfig.renderMode === 'triangle_strip' ? gl1.TRIANGLE_STRIP : gl1.LINE_LOOP;
    
    if (currentShape === 'sphere') {
        gl1.drawArrays(gl1.TRIANGLES, 0, shapeConfig.pointCount);
    } else {
        gl1.drawArrays(drawMode, 0, shapeConfig.pointCount);
    }

    if (isCapturing && capturer && targetCanvas === canvas2) {
        try {
            capturer.capture(canvas2);
            const elapsed = Date.now() - captureStartTime;
            if (statusDiv) {
                const elapsedSeconds = (elapsed / 1000).toFixed(1);
                const totalSeconds = (captureDuration / 1000).toFixed(1);
                statusDiv.textContent = `Recording ${exportName} as GIF... ${elapsedSeconds}s / ${totalSeconds}s`;
            }
        } catch (error) {
            console.error("Error capturing frame:", error);
            if (statusDiv) {
                statusDiv.className = 'alert alert-danger';
                statusDiv.textContent = `Error capturing: ${error.message}`;
            }
            stopCapture();
        }
    }

    requestAnimFrame(render);
}