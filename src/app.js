import * as THREE from 'three';
import {OrbitControls} from 'copperore/orbitcontrols';
import {CanvasIntermediateTexture} from 'copperore/canvas_intermediate_texture';
import {SkinGridBox} from 'copperore/skin_grid';
import {SkinMesh} from 'copperore/skin_mesh_creator';
import * as UI from 'copperore/ui';

// todo fix bug with colorpicking on overlay meshes
// todo fix mismatching back face for torso
var uiColorSlotsWindow;
var uiDrawingToolsWindow;
var uiColorSlot0;

var scene;
var gridScene;
var camera;
var uiScene;
var uiCamera;
var controls;

var renderer;
var geometry;

var currentIntersection;
var currentSelectedColor;

var skinMesh;
var currentSkinTexture;
var oldTexture;
var dirtyTexture = false;

// another, maybe cleaner approach
// would be to use a queue and a pointer for the current texture
// undo would decrease the pointer
// redo would increase the pointer
// will let this the way it is now but maybe someday(never) I will change it
var historyStack = [];
var revertStack = [];

var now;
var then;

var loadingScreen;

const interval = 1000/100;

const IMAGE_WIDTH = 64;
const IMAGE_HEIGHT = 64;

const skinOffsets = {
    'headOverlay':  new THREE.Vector3(0, 1.25, 0),
    'head':   new THREE.Vector3(0, 1.25, 0),
    'rl':   new THREE.Vector3(-0.25, -1.5, 0),
    'rlOverlay':   new THREE.Vector3(-0.25, -1.5, 0),
    'll':   new THREE.Vector3(+0.25, -1.5, 0),
    'llOverlay':   new THREE.Vector3(+0.25, -1.5, 0),
    'lh':   new THREE.Vector3(+0.75, 0, 0),
    'lhOverlay':   new THREE.Vector3(+0.75, 0, 0),
    'rh':   new THREE.Vector3(-0.75, 0, 0),
    'rhOverlay':   new THREE.Vector3(-0.75, 0, 0),
};

var hotkeys = {
}

const grids = {};
var guiControls = {};

var settings = {
    grid: false,
    walk: false
};

var colors = {
    brushColor: [0, 0, 0],
    clearColor: [255, 255, 255]
};
var brushSize = {
    size: 1
};

const Tools = {
    Brush: 1,
    BucketFill: 2,
    Eraser: 3,
    ColorPick: 4,
};

var currentTool = Tools.Brush;

function Loop() {
    now = Date.now();
    var elapsed = now - then;
    if(elapsed >= interval){
        then = now;

        Tick();
        Render();
    }
    requestAnimationFrame(Loop);
}

var timeCounter = 0;
const raycaster = new THREE.Raycaster();
const mousePosition = new THREE.Vector2(1000000, 1000000);
var clicked = false;

function ChangeSkin(skinPath){
    currentSkinTexture.dispose();
    currentSkinTexture = new THREE.TextureLoader().load(skinPath);
    currentSkinTexture.minFilter = THREE.NearestFilter;
    currentSkinTexture.magFilter = THREE.NearestFilter;
    skinMesh.UpdateTextureOnBodyParts(currentSkinTexture);
}

function ChangeSkinFromTexture(texture){
    currentSkinTexture.dispose();
    currentSkinTexture = texture;
    skinMesh.UpdateTextureOnBodyParts(currentSkinTexture);
}

function MouseClicked(event){
    if(event.button == 0){
        mousePosition.x = (event.clientX / window.innerWidth ) * 2 - 1;
        mousePosition.y = -( event.clientY / window.innerHeight ) * 2 + 1;
    } 
}

var alreadyDowned = false;

function MouseDown(event) {
    if(UI.DRAGGABLE_OBJECT_CLICKED){
        return;
    }

    if(event.button == 0){
        mousePosition.x = (event.clientX / window.innerWidth ) * 2 - 1;
        mousePosition.y = -( event.clientY / window.innerHeight ) * 2 + 1;
        clicked = true;
        if(!alreadyDowned){
            alreadyDowned = true;
            oldTexture = currentSkinTexture;
        }
    }
}
function KeyDown(event) {
    event = event || window.event;
    let keyCode = event.which || event.keyCode;
    let hotkeyExists = false;

    for (const [key, value] of Object.entries(hotkeys)) {
        if(keyCode == key){
            hotkeyExists = true;
        }
    }
    if(hotkeyExists){
        hotkeys[keyCode]();
        return;
    }

    if (keyCode == 90 && event.ctrlKey){
        RevertToPreviousTexture();
        AnnounceText("Undo");
    } else if (keyCode == 89 && event.ctrlKey){
        RevertPreviousRevert()
        AnnounceText("Redo");
    }
}

function MouseMove(event) {
    if(UI.DRAGGABLE_OBJECT_CLICKED){
        return;
    }

    if(event.button == 0){
        if(clicked){
            mousePosition.x = (event.clientX / window.innerWidth ) * 2 - 1;
            mousePosition.y = -( event.clientY / window.innerHeight ) * 2 + 1;
        }
    }
}

function MouseUp(event) {
    if(event.button == 0){
        clicked = false;
        AppendTextureToHistoryStack(oldTexture);
        alreadyDowned = false;
        dirtyTexture = false;
    }
}

function AppendTextureToHistoryStack(texture){
    if(dirtyTexture){ // only append previous texture if it was actually changed
        if(historyStack.length > 512 - 1){
            historyStack = historyStack.slice(1); // remove the oldest entry in order to make room for the new one
        }
        historyStack.push(texture);
    }
}

function TopOfHistoryStackTexture(){
    return historyStack.pop();
}

function TopOfRevertedHistoryStackTexture(){
    return revertStack.pop();
}

function AppendTextureToRevertedStack(texture){
    revertStack.push(texture);
}

function RevertPreviousRevert(){ // ctrl + y oposite of undo
    let revertedTexture = TopOfRevertedHistoryStackTexture();
    if(revertedTexture == undefined){
        return;
    }

    dirtyTexture = true;
    AppendTextureToHistoryStack(currentSkinTexture);

    var canvasTexture = new CanvasIntermediateTexture(revertedTexture, IMAGE_WIDTH, IMAGE_HEIGHT) // all of them have the same texture mapped
    currentSkinTexture = canvasTexture.FlushTexture();

    for (let bodyPart of Object.values(skinMesh.normalMeshes)) {
        bodyPart.material.map = currentSkinTexture;
        bodyPart.material.map.needsUpdate = true;
    }

    for (let bodyPartOverlay of Object.values(skinMesh.overlayMeshes)) {
        bodyPartOverlay.material.map = currentSkinTexture;
        bodyPartOverlay.material.map.needsUpdate = true;
    }
}

function RevertToPreviousTexture(){
    let previousTexture = TopOfHistoryStackTexture();
    if(previousTexture == undefined){
        return;
    }

    AppendTextureToRevertedStack(currentSkinTexture);

    var canvasTexture = new CanvasIntermediateTexture(previousTexture, IMAGE_WIDTH, IMAGE_HEIGHT) // all of them have the same texture mapped
    currentSkinTexture = canvasTexture.FlushTexture();

    for (let bodyPart of Object.values(skinMesh.normalMeshes)) {
        bodyPart.material.map = currentSkinTexture;
        bodyPart.material.map.needsUpdate = true;
    }

    for (let bodyPartOverlay of Object.values(skinMesh.overlayMeshes)) {
        bodyPartOverlay.material.map = currentSkinTexture;
        bodyPartOverlay.material.map.needsUpdate = true;
    }
}

function ApplyBrush(intermediateTexture, point, color){
    intermediateTexture.ChangePixelAtArray(point, color);
}

function FillColor(intermediateTexture, point, newColor){
    intermediateTexture.visitedTable = {}; // this should be in the intermediate texture class
    var originalPixel = intermediateTexture.PixelAt(point);
    intermediateTexture.Fill(point, originalPixel, newColor);
    intermediateTexture.ChangePixelAt(point, newColor);
}

function GetCurrentSlotColor(){
    return currentColorSlot.material.color;
}

function ToolAction(part){
    let p = new THREE.Vector2(part.uv.x * IMAGE_WIDTH, part.uv.y * IMAGE_HEIGHT);
    p.x = Math.floor(p.x);
    p.y = IMAGE_HEIGHT - Math.ceil(p.y);
    
    var canvasTexture = new CanvasIntermediateTexture(currentSkinTexture, IMAGE_WIDTH, IMAGE_HEIGHT);

    switch(currentTool){
        case Tools.Brush:{
            let c = GetCurrentSlotColor();
            c.a = 1;
            
            let arr = [c.r * 255, c.g * 255, c.b * 255, c.a * 255];
            ApplyBrush(canvasTexture, p, arr);
            break;
        }
        case Tools.BucketFill:{
            let c = GetCurrentSlotColor();
            c.a = 1;
            let arr = [c.a * 255, c.r * 255, c.g * 255, c.b * 255];
            FillColor(canvasTexture, p, c);
            break;
        }
        case Tools.Eraser:{
            ApplyBrush(canvasTexture, p, new THREE.Color(1, 1, 1, 0));
            break;
        }
        case Tools.ColorPick:{
            let selectedPixel = canvasTexture.PixelAt(p);
            colors.brushColor = selectedPixel;
            
            UpdateCurrentSlotColor(colors.brushColor);
            guiControls['brushColor'].updateDisplay(); // update the color display
            break;
        }
    }
    dirtyTexture = true;
    currentSkinTexture = canvasTexture.FlushTexture();
    part.object.material.map = currentSkinTexture;
    part.object.material.needsUpdate = true;
}

function WalkAnimationTick(meshGroup, value, translation){
    meshGroup.translateY(translation);
    meshGroup.rotateX(value);
    meshGroup.translateY(-translation);
}

function ResetAnimation(){
    timeCounter = 0;
    skinMesh.meshGroups['ll'].rotation.x = 0;
    skinMesh.meshGroups['rl'].rotation.x = 0;
    skinMesh.meshGroups['lh'].rotation.x = 0;
    skinMesh.meshGroups['rh'].rotation.x = 0;

    let tmp = skinMesh.originalPosition['ll'];
    skinMesh.meshGroups['ll'].position.set(tmp.x, tmp.y, tmp.z);

    tmp = skinMesh.originalPosition['rl'];
    skinMesh.meshGroups['rl'].position.set(tmp.x, tmp.y, tmp.z);

    tmp = skinMesh.originalPosition['lh'];
    skinMesh.meshGroups['lh'].position.set(tmp.x, tmp.y, tmp.z);

    tmp = skinMesh.originalPosition['rh'];
    skinMesh.meshGroups['rh'].position.set(tmp.x, tmp.y, tmp.z);
}

function CompleteWalkAnimationTick(rotationAmount){
    WalkAnimationTick(skinMesh.meshGroups['ll'], rotationAmount, -0.5);
    WalkAnimationTick(skinMesh.meshGroups['rl'], -rotationAmount, -0.5);
    WalkAnimationTick(skinMesh.meshGroups['lh'], -rotationAmount, 0.5);
    WalkAnimationTick(skinMesh.meshGroups['rh'], rotationAmount, 0.5);
}

function Tick() {
    controls.update();
    
    uiColorSlotsWindow.TickChildren();
    uiDrawingToolsWindow.TickChildren();

    if(settings.walk){
        timeCounter += 0.02;
        let rotationAmount = Math.cos(timeCounter) * 0.05;
        CompleteWalkAnimationTick(rotationAmount * 0.2);
    } else {
        ResetAnimation();
    }

    if(clicked){
        raycaster.setFromCamera(mousePosition, camera );
        const intersects = raycaster.intersectObjects( scene.children );
        if(intersects.length > 0){
            currentIntersection = 0;
            let bad = false;
            while(!intersects[currentIntersection].object.visible){
                ++currentIntersection;
                if(currentIntersection >= intersects.length){
                    bad = true;
                    break;
                }
            }
            if(!bad) {                
                if(intersects[currentIntersection].object.userData.bodyModel == true){
                    ToolAction(intersects[currentIntersection]);
                }
            }
        }
    }

    for (let gridPart of Object.values(grids)) {
        gridPart.Visible(settings.grid);
    }
}

function Render() {
    renderer.autoClear = true;
    renderer.render( scene, camera );
    
    renderer.autoClear = false;
    renderer.render( gridScene, camera );
    
    renderer.autoClear = false;
    renderer.render( uiScene, uiCamera );
}

function AnnounceText(text){
    let alreadyAnnouncers = document.getElementsByClassName("fade-out");
    for(let i = 0; i < alreadyAnnouncers.length; ++i){
        document.body.removeChild(alreadyAnnouncers[i]);
    }

    var announcerText = document.createElement('div');
    announcerText.className = "fade-out";
    announcerText.innerHTML = text;
    document.body.appendChild(announcerText);
    setTimeout(() => {
        document.body.removeChild(announcerText);
    }, 1000)
}

function SelectBrush(){
    currentTool = Tools.Brush;
    AnnounceText("Brush");
}

function SelectEraser(){
    currentTool = Tools.Eraser;
    AnnounceText("Eraser");
}

function SelectBucketFill(){
    currentTool = Tools.BucketFill;
    AnnounceText("Bucket Fill");
}

function SelectColorPick(){
    currentTool = Tools.ColorPick;
    AnnounceText("Color Pick");
}

function CreateAndAddToSceneGridForBodypart(bodypart, scene, width, height, boxSize, skinOffsets){
    var gridBox = new SkinGridBox(boxSize, width, height);
    for(let i = 0; i < gridBox.grids.length; ++i){
        if(skinOffsets[bodypart] != undefined){
            gridBox.grids[i].position.add(skinOffsets[bodypart]);
        }
        scene.add(gridBox.grids[i]);
    }
    return gridBox;
}

function TogglePart(part){
    skinMesh.normalMeshes[part].visible = !skinMesh.normalMeshes[part].visible;
}

function ToggleOverlayPart(part){
    skinMesh.overlayMeshes[part].visible = !skinMesh.overlayMeshes[part].visible;
}

var currentColorSlot = undefined;
function SelectColorSlot(button){
    currentColorSlot = button;
    currentSelectedColor = button.material.color;

    colors.brushColor = [currentSelectedColor.r * 255, currentSelectedColor.g * 255, currentSelectedColor.b * 255];
    guiControls['brushColor'].updateDisplay();
}

function ShowLoadingScreen(){
    loadingScreen.style.visibility = 'visible';
}

function HideLoadingScreen(){
    loadingScreen.style.visibility = 'hidden';
}

function UpdateCurrentSlotColor(color){
    currentColorSlot.material.color = new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255);
    currentColorSlot.material.needsUpdate = true;
}

const GetTextureFromURL = (url) => new Promise((finalResolve, finalReject) => {
    var canvas = document.createElement("canvas");
    canvas.width = IMAGE_WIDTH;
    canvas.height = IMAGE_HEIGHT;
    var context = canvas.getContext("2d");

    const loadImage = (url) => new Promise((resolve, reject) => {
        const skinImage = new Image();
        skinImage.crossOrigin = "anonymous";
        skinImage.addEventListener('load', () => resolve(skinImage));
        skinImage.addEventListener('error', (err) => reject(err));
        skinImage.src = url;
    });

    loadImage(url)
        .then(img => {
            context.drawImage(img, 0, 0);
            if(img.height < 64){
                // fill in the rest of the texture
                let fillerImage = new Image(64, 32);
                context.drawImage(fillerImage, 0, 32);
            }
    
            var newTexture = new THREE.Texture(canvas);
            newTexture.minFilter = THREE.NearestFilter;
            newTexture.magFilter = THREE.NearestFilter;
            finalResolve(newTexture.clone());
        })
        .catch(err => console.error(err));
});

function CreateSkybox(index){
    let backgroundMaterials = [
        new THREE.MeshBasicMaterial( {map : new THREE.TextureLoader().load('/assets/skybox' + index + '/pz.png'), side:THREE.DoubleSide } ),
        new THREE.MeshBasicMaterial( {map : new THREE.TextureLoader().load('/assets/skybox' + index + '/nz.png'), side:THREE.DoubleSide } ),
        
        new THREE.MeshBasicMaterial( {map : new THREE.TextureLoader().load('/assets/skybox' + index + '/py.png'), side:THREE.DoubleSide } ),
        new THREE.MeshBasicMaterial( {map : new THREE.TextureLoader().load('/assets/skybox' + index + '/ny.png'), side:THREE.DoubleSide } ),
        
        new THREE.MeshBasicMaterial( {map : new THREE.TextureLoader().load('/assets/skybox' + index + '/nx.png'), side:THREE.DoubleSide } ),
        new THREE.MeshBasicMaterial( {map : new THREE.TextureLoader().load('/assets/skybox' + index + '/px.png'), side:THREE.DoubleSide } ),
    ]

    var backgroundBox = new THREE.BoxGeometry(256, 256, 256);
    return new THREE.Mesh(backgroundBox, backgroundMaterials);
}    

window.onload = (event) => {
    window.addEventListener('click', MouseClicked);
    window.addEventListener('mousedown', MouseDown);
    window.addEventListener('mousemove', MouseMove);
    window.addEventListener('mouseup', MouseUp);
    window.addEventListener('keydown', KeyDown);

    hotkeys[66] = SelectBrush; // b
    hotkeys[69] = SelectEraser; // e
    hotkeys[73] = SelectColorPick; // i
    hotkeys[71] = SelectBucketFill; // g

    scene = new THREE.Scene();
    gridScene = new THREE.Scene(); // separated for intersections

    renderer = new THREE.WebGLRenderer();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    renderer.sortObjects = false;
    renderer.setSize( window.innerWidth, window.innerHeight);
    renderer.setClearColor(new THREE.Color(0.1, 0.1, 0.1));
    renderer.outputColorSpace = THREE.NoColorSpace;

    document.body.appendChild( renderer.domElement );
    ///
    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.01, 1000 );
    controls = new OrbitControls(camera, renderer.domElement);
    // window.addEventListener( 'resize', onWindowResize );
    ///
    currentSkinTexture = new THREE.TextureLoader().load('assets/gigachad.png'); 
    currentSkinTexture.minFilter = THREE.NearestFilter;
    currentSkinTexture.magFilter = THREE.NearestFilter;

    // initialize position offsets somewhere
    skinMesh = new SkinMesh();
    skinMesh.InitializeFullMesh(currentSkinTexture);
    skinMesh.ApplyOffsetsToBodyParts(skinOffsets);
    skinMesh.AddToScene(scene);

    // skinMesh.normalMeshes['head'].visible = false;

    camera.position.z = 5;
    then = Date.now();
    currentSelectedColor = colors.brushColor;
    
    let fields = {
        'username': ""
    }

    let buttons = {
        'clearSkinFullTransparent': () => {
            let canvasTexture = new CanvasIntermediateTexture(undefined, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_WIDTH, IMAGE_HEIGHT);
            canvasTexture.ClearPixelsAlpha(IMAGE_WIDTH, IMAGE_HEIGHT);
          
            dirtyTexture = true;
            AppendTextureToHistoryStack(currentSkinTexture);

            ChangeSkinFromTexture(canvasTexture.FlushTexture());
        },
        'clearSkin': () => {
            let canvasTexture = new CanvasIntermediateTexture(undefined, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_WIDTH, IMAGE_HEIGHT);
            canvasTexture.ClearPixels(IMAGE_WIDTH, IMAGE_HEIGHT, new THREE.Color(colors.clearColor[0] / 255, colors.clearColor[1] / 255, colors.clearColor[2] / 255));
            
            dirtyTexture = true;
            AppendTextureToHistoryStack(currentSkinTexture);

            ChangeSkinFromTexture(canvasTexture.FlushTexture());
        },
        'save': () => {
            let canvas = document.createElement('canvas');
            canvas.width = currentSkinTexture.image.width;
            canvas.height = currentSkinTexture.image.height;
            let context = canvas.getContext('2d');
            context.drawImage(currentSkinTexture.image, 0, 0);

            var link = document.getElementById('link');
            link.setAttribute('download', 'skin.png');
            link.setAttribute('href', canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"));
            link.click();
        },
        'open': () => {
            document.getElementById('fileInput').click();
        },
        'useUsernameSkin': ()=>{
            ShowLoadingScreen();
            var imageLoaded = false;
            setTimeout(() => {
                if(imageLoaded){
                    HideLoadingScreen();
                }
            }, 1000)
            let link = "https://api.ashcon.app/mojang/v2/user/" + fields['username'];
            
            fetch(link, {})  
                .then(response => response.json())
                .then(json => {
                    let textureURL = json['textures']['skin']['url'];
                    GetTextureFromURL(textureURL)
                        .then(texture => ChangeSkinFromTexture(texture));
                });
            imageLoaded = true;
        }
    };

    let fileUploader = document.getElementById('fileInput');
    fileUploader.onchange = (event) => {
        let file = event.target.files[0];
        var fileReader = new FileReader();
        fileReader.onload = () => {
            GetTextureFromURL(fileReader.result)
            .then(texture => ChangeSkinFromTexture(texture));
        };
        fileReader.readAsDataURL(file);
    };

    const gui = new dat.GUI();
    const editFolder = gui.addFolder("Edit");
    editFolder.open();
    guiControls['brushSize'] = editFolder.add(brushSize, 'size', 0, 8, 1).name("Brush Size");
    guiControls['normalGridToggle'] = editFolder.add(settings, 'grid', false).name("Grid");
    guiControls['brushColor'] = editFolder.addColor(colors, 'brushColor').name("Brush Color").onChange(() => {
        UpdateCurrentSlotColor(colors.brushColor);
    });

    guiControls['clearSkinColor'] = editFolder.add(buttons, 'clearSkin').name("Clear Skin with Color");
    guiControls['clearColor'] = editFolder.addColor(colors, 'clearColor').name("Clear Color").onChange(() => {
        buttons.clearSkin();
    });
    guiControls['clearSkinFullTransparent'] = editFolder.add(buttons, 'clearSkinFullTransparent').name("Clear Skin Full Transparant");
     
    const animationFolder = gui.addFolder("Animation");
    animationFolder.open();
    guiControls['walkToggle'] = animationFolder.add(settings, 'walk', false).name("Walk");

    const fileFolder = gui.addFolder("File");
    fileFolder.open();
    guiControls['saveFile'] = fileFolder.add(buttons, 'save').name("Download Skin to Disk");
    guiControls['openFile'] = fileFolder.add(buttons, 'open').name("Open skin file from Disk");

    guiControls['usernameField'] = fileFolder.add(fields, 'username').name("Username");
    guiControls['useUsernameSkin'] = fileFolder.add(buttons, 'useUsernameSkin').name("Use skin from username");

    grids['head'] = CreateAndAddToSceneGridForBodypart('head', gridScene, 8, 8, new THREE.Vector3(1.0, 1.0, 1.0), skinOffsets);
    grids['torso'] = CreateAndAddToSceneGridForBodypart('torso', gridScene, 8, 12, new THREE.Vector3(1.0, 1.5, 0.5), skinOffsets);
    grids['rh'] = CreateAndAddToSceneGridForBodypart('rh', gridScene, 4, 12, new THREE.Vector3(0.5, 1.5, 0.5), skinOffsets);
    grids['lh'] = CreateAndAddToSceneGridForBodypart('lh', gridScene, 4, 12, new THREE.Vector3(0.5, 1.5, 0.5), skinOffsets);
    grids['rl'] = CreateAndAddToSceneGridForBodypart('rl', gridScene, 4, 12, new THREE.Vector3(0.5, 1.5, 0.5), skinOffsets);
    grids['ll'] = CreateAndAddToSceneGridForBodypart('ll', gridScene, 4, 12, new THREE.Vector3(0.5, 1.5, 0.5), skinOffsets);

    grids['head'].visible = false;

    uiCamera = new THREE.OrthographicCamera(0, window.innerWidth, 0, window.innerHeight, 1, 1000);
    uiCamera.position.z = 1;

    uiScene = new THREE.Scene();

    uiColorSlotsWindow = new UI.Window(new THREE.Vector2(300, 300), new THREE.Vector2(100, 100), "AAAAAAAAAA");
    uiDrawingToolsWindow = new UI.Window(new THREE.Vector2(200, 300), new THREE.Vector2(32 + 32, 185));

    uiScene.add(uiColorSlotsWindow.mesh);
    uiScene.add(uiColorSlotsWindow.dragBarMesh);

    for(let i = 0; i < 16; ++i){
        let colorSlot = new UI.EmptyButton(uiColorSlotsWindow, 
            new THREE.Vector2(4 + 16 + (i % 4) * (4 + 16), 4 + 16 + Math.floor(i/4) * (4 + 16)), new THREE.Vector2(16, 16), (button) => {
            SelectColorSlot(button);
        });
        if(i == 0) {currentColorSlot = colorSlot;}
        uiScene.add(colorSlot.mesh);
    }

    uiScene.add(uiDrawingToolsWindow.mesh);
    uiScene.add(uiDrawingToolsWindow.dragBarMesh);

    let toolIconSize = 32;

    uiScene.add(new UI.IconButton(uiDrawingToolsWindow, 
        new THREE.Vector2(toolIconSize, toolIconSize), new THREE.Vector2(toolIconSize, toolIconSize), "assets/brushIcon.png", (button) => {
        SelectBrush();
    }).mesh);

    uiScene.add(new UI.IconButton(uiDrawingToolsWindow, 
        new THREE.Vector2(toolIconSize, toolIconSize + toolIconSize + 8), new THREE.Vector2(toolIconSize, toolIconSize), "assets/bucketFillIcon.png", (button) => {
        SelectBucketFill();
    }).mesh);

    uiScene.add(new UI.IconButton(uiDrawingToolsWindow, 
        new THREE.Vector2(toolIconSize, toolIconSize * 2 + toolIconSize + 8 * 2), new THREE.Vector2(toolIconSize, toolIconSize), "assets/colorPickIcon.png", (button) => {
        SelectColorPick();
    }).mesh);

    uiScene.add(new UI.IconButton(uiDrawingToolsWindow, 
        new THREE.Vector2(toolIconSize, toolIconSize * 3 + toolIconSize + 8 * 3), new THREE.Vector2(toolIconSize, toolIconSize), "assets/eraserIcon.png", (button) => {
        SelectEraser();
    }).mesh);

    var skyboxes = [
        CreateSkybox(0),
        CreateSkybox(1)
    ];

    scene.add(skyboxes[1]);

    loadingScreen = document.getElementsByClassName('loading')[0];
    HideLoadingScreen();

    Loop();
}

export {TogglePart, ToggleOverlayPart};