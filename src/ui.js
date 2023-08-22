import * as THREE from 'three';

var DRAGGABLE_OBJECT_CLICKED = false;
class AABB {
    Intersects = (point) => {
        let x0 = this.position.x - (this.size.x / 2);
        let y0 = this.position.y - (this.size.y / 2);
        let x1 = x0 + this.size.x;
        let y1 = y0 + this.size.y;
        return (point.x >= x0 && point.x <= x1 &&
                point.y >= y0 && point.y <= y1);
    }

    constructor(position, size){
        this.position = position;
        this.size = size;
    }
}

class EmptyButton {
    MouseClicked = (event) => {
        var mousePoint = new THREE.Vector2(event.clientX, event.clientY);
        if(this.aabb.Intersects(mousePoint)){
            this.callback(this);
        }
    }
    constructor(parent, position, size, callback){
        window.addEventListener('click', this.MouseClicked);

        this.callback = callback;
        this.parent = parent;
        this.parent.children.push(this);
        // dont really need 2 vectors stored for position
        // but it doesn't really matter
        this.originalPosition = position;
        this.position = position;
        this.size = size;

        this.aabb = new AABB(new THREE.Vector2(position.x, position.y), size);

        this.geometry = new THREE.PlaneGeometry(size.x, size.y);
        this.material = new THREE.MeshBasicMaterial( {color: 0xffffff, side: THREE.DoubleSide} );

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.x = this.position.x - this.parent.size.x / 2;
        this.mesh.position.y = this.position.y - this.parent.size.y / 2;
    }

    Tick = () => {
        this.position = new THREE.Vector2().addVectors(this.originalPosition, this.parent.position);
        
        this.mesh.position.x = this.position.x - this.parent.size.x / 2;
        this.mesh.position.y = this.position.y - this.parent.size.y / 2;

        this.aabb.position.x = this.position.x - this.parent.size.x / 2;
        this.aabb.position.y = this.position.y - this.parent.size.y / 2;
    }
}

class IconButton {
    MouseClicked = (event) => {
        var mousePoint = new THREE.Vector2(event.clientX, event.clientY);
        if(this.aabb.Intersects(mousePoint)){
            this.callback(this);
        }
    }
    constructor(parent, position, size, iconPath, callback){
        window.addEventListener('click', this.MouseClicked);

        this.callback = callback;
        this.parent = parent;
        this.parent.children.push(this);
        // dont really need 2 vectors stored for position
        // but it doesn't really matter
        this.originalPosition = position;
        this.position = position;
        this.size = size;

        this.aabb = new AABB(new THREE.Vector2(position.x, position.y), size);

        this.geometry = new THREE.PlaneGeometry(size.x, size.y);
        this.icon = new THREE.TextureLoader().load(iconPath); 
        this.icon.minFilter = THREE.NearestFilter;
        this.icon.magFilter = THREE.NearestFilter;
        this.icon.flipY = false;
        this.material = new THREE.MeshBasicMaterial( {color: 0xeeeeee, side: THREE.DoubleSide, map: this.icon} );

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.x = this.position.x - this.parent.size.x / 2;
        this.mesh.position.y = this.position.y - this.parent.size.y / 2;
    }

    Tick = () => {
        this.position = new THREE.Vector2().addVectors(this.originalPosition, this.parent.position);
        
        this.mesh.position.x = this.position.x - this.parent.size.x / 2;
        this.mesh.position.y = this.position.y - this.parent.size.y / 2;

        this.aabb.position.x = this.position.x - this.parent.size.x / 2;
        this.aabb.position.y = this.position.y - this.parent.size.y / 2;
    }
}


class Window{
    MouseDown = (event) => {
        if(!this.alreadyDown){
            this.oldMousePosition = new THREE.Vector2(event.clientX, event.clientY);
            if(this.dragBarAABB.Intersects(this.oldMousePosition)){
                DRAGGABLE_OBJECT_CLICKED = true;
                this.alreadyDown = true;
                this.anchorPosition = this.position;
            }
        }
    }
    MouseMove = (event) => {
        if(this.alreadyDown){
            var mousePoint = new THREE.Vector2(event.clientX, event.clientY);
            if(this.dragBarAABB.Intersects(mousePoint) || this.startedDrag){
                this.startedDrag = true;
                this.newMousePosition = mousePoint;
                let direction = new THREE.Vector2().subVectors(this.newMousePosition, this.oldMousePosition);
                let newpos = new THREE.Vector2().addVectors(this.anchorPosition, direction);
                this.UpdatePosition(newpos);
            }
        }
    }

    MouseUp = (event) => {
        this.alreadyDown = false;
        this.startedDrag = false;
        DRAGGABLE_OBJECT_CLICKED = false;
    }

    constructor(position, size, title=""){
        window.addEventListener('mousedown', this.MouseDown);
        window.addEventListener('mousemove', this.MouseMove);
        window.addEventListener('mouseup', this.MouseUp);

        this.children = [];

        this.position = position;
        this.size = size;
        this.aabb = new AABB(position, size);

        const geometry = new THREE.PlaneGeometry(size.x, size.y);
        const material = new THREE.MeshBasicMaterial( {color: 0x666666, side: THREE.DoubleSide} );
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.x = this.position.x;
        this.mesh.position.y = this.position.y;

        const dragBarGeometry = new THREE.PlaneGeometry(size.x, 16);
        const dragBarMaterial = new THREE.MeshBasicMaterial( {color: 0x333333, side: THREE.DoubleSide} );
        this.dragBarMesh = new THREE.Mesh(dragBarGeometry, dragBarMaterial);
        this.dragBarMesh.position.x = this.position.x;
        this.dragBarMesh.position.y = this.position.y - this.size.y / 2 - 8;
        this.dragBarSize = new THREE.Vector2(size.x, 16);
        this.dragBarAABB = new AABB(this.dragBarMesh.position, this.dragBarSize);

        this.title = title;
     }

    TickChildren = () => {
        this.children.forEach((child) => {
            child.Tick();
        })
    }

    UpdatePosition = (newPosition) => {
        // move mesh and dragbar
        this.position = newPosition;
        this.aabb.position = newPosition;

        this.mesh.position.x = this.position.x;
        this.mesh.position.y = this.position.y;

        this.dragBarMesh.position.x = this.position.x;
        this.dragBarMesh.position.y = this.position.y - this.size.y / 2 - 8;

        this.dragBarAABB = new AABB(this.dragBarMesh.position, this.dragBarSize);
    }

    UpdateSize = (newSize) => {
        this.size = newSize;
        this.aabb.size = newSize;
        this.dragBarSize = new THREE.Vector2(size.x, 16);
    }
}

export {DRAGGABLE_OBJECT_CLICKED, EmptyButton, IconButton, Window};