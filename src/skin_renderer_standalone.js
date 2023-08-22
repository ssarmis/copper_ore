import * as THREE from 'three';
import {SkinMesh} from 'copperore/skin_mesh_creator';

function SkinRendererStandalone(){
    var scene;
    var camera;
    
    var renderer;
    
    var now;
    var then;
    
    const interval = 1000/100;
    
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
    
    function Tick() {
        if(clicked){
            raycaster.setFromCamera(mousePosition, camera );
            const intersects = raycaster.intersectObjects( scene.children );
            if(intersects.length > 0){
                if(intersects[0].object.userData.bodyModel == true){
                    ToolAction(intersects[0]);
                }
            }
        }
    }
    
    function Render() {
        renderer.render( scene, camera );
    }
    
    this.InitializeAndStartRender = (skinPath, width, height) => {
        scene = new THREE.Scene();
    
        renderer = new THREE.WebGLRenderer();
        renderer.setSize( width, height);
        renderer.setClearColor(new THREE.Color(100, 100, 100))
        document.body.appendChild( renderer.domElement );
        ///
        camera = new THREE.PerspectiveCamera( 75, width / height, 0.01, 1000 );
        ///
        const texture = new THREE.TextureLoader().load(skinPath); 
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;

        var skinMesh = new SkinMesh();
        skinMesh.InitializeFullMesh(texture);

        skinMesh.headOverlay.position.y += 1.25;
    
        skinMesh.head.position.y += 1.25;
    
        skinMesh.rl.position.y -= 1.5;
        skinMesh.rl.position.x -= 0.25;
    
        skinMesh.rlOverlay.position.y -= 1.5;
        skinMesh.rlOverlay.position.x -= 0.25;
    
        skinMesh.ll.position.y -= 1.5;
        skinMesh.ll.position.x += 0.25;
    
        skinMesh.llOverlay.position.y -= 1.5;
        skinMesh.llOverlay.position.x += 0.25;
    
        skinMesh.lh.position.x += 0.75;
        skinMesh.lhOverlay.position.x += 0.75;
    
        skinMesh.rh.position.x -= 0.75;
        skinMesh.rhOverlay.position.x -= 0.75;
    
        scene.add(skinMesh.head);
        scene.add(skinMesh.torso);
        scene.add(skinMesh.rl);
        scene.add(skinMesh.ll);
        scene.add(skinMesh.lh);
        scene.add(skinMesh.rh);
    
        scene.add(skinMesh.headOverlay);
        scene.add(skinMesh.torsoOverlay);
        scene.add(skinMesh.rlOverlay);
        scene.add(skinMesh.llOverlay);
        scene.add(skinMesh.lhOverlay);
        scene.add(skinMesh.rhOverlay);
    
        camera.position.z = 5;
        then = Date.now();
        Loop();
    }
}

export {SkinRendererStandalone};