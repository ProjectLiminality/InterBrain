/**
 * Drop Handlers for DreamspaceCanvas
 *
 * This module contains all the logic for handling file and URL drops.
 * The actual event wiring is in DreamspaceCanvas since it needs canvas refs,
 * but all the processing logic lives here.
 */

import type { RefObject, MutableRefObject } from 'react';
import { Vector3, Raycaster, Sphere, Mesh, Group } from 'three';
import { DreamNode } from '../dreamnode';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { serviceManager, type IDreamNodeService } from '../../core/services/service-manager';
import { UIService } from '../../core/services/ui-service';
import { processDroppedUrlData } from './url-utils';
import type { SpatialOrchestratorRef } from '../../core/components/SpatialOrchestrator';

/**
 * UIService instance for drop operation feedback
 * Note: Created without app since drop-handlers only needs notification methods
 */
const uiService = new UIService();

/**
 * Radius of the DreamWorld sphere for raycasting calculations
 */
const DREAMWORLD_SPHERE_RADIUS = 5000;

/**
 * Camera field of view in radians (75 degrees)
 */
const CAMERA_FOV_RAD = 75 * Math.PI / 180;

/**
 * Result of setting up a raycast from screen coordinates
 */
interface RaycastSetup {
  raycaster: Raycaster;
  canvasRect: globalThis.DOMRect;
}

/**
 * Create a raycaster from screen coordinates
 * Shared setup logic for calculateDropPosition and detectDropTarget
 */
function createRaycastFromScreenCoords(
  mouseX: number,
  mouseY: number
): RaycastSetup | null {
  const canvasElement = globalThis.document.querySelector(
    '.dreamspace-canvas-container canvas'
  ) as globalThis.HTMLCanvasElement;

  if (!canvasElement) return null;

  const rect = canvasElement.getBoundingClientRect();

  // Convert screen coordinates to normalized device coordinates (-1 to 1)
  const ndcX = ((mouseX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((mouseY - rect.top) / rect.height) * 2 + 1;

  // Calculate ray direction with perspective projection
  const aspect = rect.width / rect.height;
  const tanHalfFov = Math.tan(CAMERA_FOV_RAD / 2);

  const rayDirection = new Vector3(
    ndcX * tanHalfFov * aspect,
    ndcY * tanHalfFov,
    -1
  ).normalize();

  const raycaster = new Raycaster();
  raycaster.set(new Vector3(0, 0, 0), rayDirection);

  return { raycaster, canvasRect: rect };
}

/**
 * Validate media file types for DreamTalk
 * Allows images, videos, PDFs, and .link files
 */
export function isValidMediaFile(file: globalThis.File): boolean {
  const validTypes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'application/pdf',
    // .link files appear as text/plain or application/octet-stream depending on system
    'text/plain',
    'application/octet-stream'
  ];

  // Also check file extension for .link and .pdf files since MIME detection is unreliable
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.link') || fileName.endsWith('.pdf')) {
    return true;
  }

  return validTypes.includes(file.type);
}

/**
 * Calculate 3D position from mouse coordinates projected onto sphere
 */
export function calculateDropPosition(
  mouseX: number,
  mouseY: number,
  dreamWorldRef: RefObject<Group | null>
): [number, number, number] {
  const raycastSetup = createRaycastFromScreenCoords(mouseX, mouseY);
  if (!raycastSetup) return [0, 0, -DREAMWORLD_SPHERE_RADIUS]; // Fallback position

  const { raycaster } = raycastSetup;

  // Find intersection with sphere
  const worldSphere = new Sphere(new Vector3(0, 0, 0), DREAMWORLD_SPHERE_RADIUS);
  const intersectionPoint = new Vector3();
  const hasIntersection = raycaster.ray.intersectSphere(worldSphere, intersectionPoint);

  if (hasIntersection && dreamWorldRef.current) {
    // Apply inverse rotation to account for sphere rotation
    const sphereRotation = dreamWorldRef.current.quaternion;
    const inverseRotation = sphereRotation.clone().invert();
    intersectionPoint.applyQuaternion(inverseRotation);

    return intersectionPoint.toArray() as [number, number, number];
  }

  console.warn('No intersection found with sphere - using fallback');
  return [0, 0, -DREAMWORLD_SPHERE_RADIUS];
}

/**
 * Drop target detection result
 */
export interface DropTargetResult {
  type: 'empty' | 'node';
  position: [number, number, number];
  node?: DreamNode;
}

/**
 * Detect what's under the drop position using scene-based raycasting
 */
export function detectDropTarget(
  mouseX: number,
  mouseY: number,
  hitSphereRefs: MutableRefObject<Map<string, RefObject<Mesh | null>>>,
  dreamWorldRef: RefObject<Group | null>
): DropTargetResult {
  const raycastSetup = createRaycastFromScreenCoords(mouseX, mouseY);
  if (!raycastSetup) {
    return { type: 'empty', position: [0, 0, -DREAMWORLD_SPHERE_RADIUS] };
  }

  const { raycaster } = raycastSetup;

  // Collect all hit sphere meshes for raycasting
  const hitSpheres: Mesh[] = [];
  hitSphereRefs.current.forEach((meshRef) => {
    if (meshRef.current) {
      hitSpheres.push(meshRef.current);
    }
  });

  // Use Three.js native raycasting against hit sphere geometries
  const intersections = raycaster.intersectObjects(hitSpheres);

  // Calculate drop position on sphere
  const dropPosition = calculateDropPosition(mouseX, mouseY, dreamWorldRef);

  if (intersections.length > 0) {
    // Get the closest intersection
    const closestIntersection = intersections[0];
    const hitMesh = closestIntersection.object as Mesh;
    const dreamNodeData = hitMesh.userData.dreamNode as DreamNode;

    return { type: 'node', position: dropPosition, node: dreamNodeData };
  } else {
    return { type: 'empty', position: dropPosition };
  }
}

/**
 * Context for liminal-web auto-relationship creation
 */
interface LiminalWebContext {
  shouldAutoRelate: boolean;
  nodeType: 'dream' | 'dreamer';
  focusedNodeId: string | null;
}

/**
 * Determine if we should auto-create relationship in liminal-web mode
 */
function getLiminalWebContext(): LiminalWebContext {
  const store = useInterBrainStore.getState();

  if (store.spatialLayout === 'liminal-web' && store.selectedNode) {
    const focusedNode = store.selectedNode;
    return {
      shouldAutoRelate: true,
      nodeType: focusedNode.type === 'dream' ? 'dreamer' : 'dream',
      focusedNodeId: focusedNode.id
    };
  }

  return {
    shouldAutoRelate: false,
    nodeType: 'dream',
    focusedNodeId: null
  };
}

/**
 * Auto-create relationship in liminal-web mode and trigger layout refresh
 */
async function autoRelateInLiminalWeb(
  service: IDreamNodeService,
  newNode: DreamNode,
  nodeType: 'dream' | 'dreamer',
  focusedNodeId: string,
  spatialOrchestratorRef: RefObject<SpatialOrchestratorRef | null>
): Promise<void> {
  const store = useInterBrainStore.getState();

  try {
    // Add bidirectional relationship
    await service.addRelationship(focusedNodeId, newNode.id);
    uiService.showSuccess(`Created ${nodeType} "${newNode.name}" and related to focused node`);

    // Refresh the focused node to include the new relationship
    const updatedFocusedNode = await service.get(focusedNodeId);
    if (updatedFocusedNode) {
      store.setSelectedNode(updatedFocusedNode);

      // Trigger a liminal-web layout refresh with smooth fly-in for the new node
      globalThis.setTimeout(() => {
        if (spatialOrchestratorRef.current) {
          spatialOrchestratorRef.current.focusOnNodeWithFlyIn(focusedNodeId, newNode.id);
        }
      }, 100);
    }
  } catch (error) {
    console.error('Failed to create automatic relationship:', error);
  }
}

/**
 * Handle dropping files on an existing DreamNode
 */
export async function handleDropOnNode(files: globalThis.File[], node: DreamNode): Promise<void> {
  try {
    const service = serviceManager.getActive();

    // In regular mode (not edit mode), just add files without updating dreamTalk
    // This treats file drops like dropping files on a folder
    if (service.addFilesToNodeWithoutDreamTalkUpdate) {
      await service.addFilesToNodeWithoutDreamTalkUpdate(node.id, files);
      uiService.showSuccess(`Added ${files.length} file(s) to "${node.name}"`);
    } else {
      // Fallback for services that don't support the new method
      await service.addFilesToNode(node.id, files);
    }
  } catch (error) {
    console.error('Failed to add files to node:', error);
    uiService.showError(error instanceof Error ? error.message : 'Failed to add files to node');
  }
}

/**
 * Handle normal file drop on empty space - creates node instantly
 */
export async function handleNormalDrop(
  files: globalThis.File[],
  position: [number, number, number],
  spatialOrchestratorRef: RefObject<SpatialOrchestratorRef | null>
): Promise<void> {
  try {
    const primaryFile = files[0];
    const fileNameWithoutExt = primaryFile.name.replace(/\.[^/.]+$/, '');

    // Convert PascalCase file names to human-readable titles
    const { isPascalCase, pascalCaseToTitle } = await import('../dreamnode/utils/title-sanitization');
    const humanReadableTitle = isPascalCase(fileNameWithoutExt)
      ? pascalCaseToTitle(fileNameWithoutExt)
      : fileNameWithoutExt;

    const service = serviceManager.getActive();

    // Find first valid media file for dreamTalk
    const dreamTalkFile = files.find(f => isValidMediaFile(f));
    const additionalFiles = files.filter(f => f !== dreamTalkFile);

    // Get liminal-web context for auto-relationship
    const { shouldAutoRelate, nodeType, focusedNodeId } = getLiminalWebContext();

    // Create node with determined type
    const newNode = await service.create(
      humanReadableTitle,
      nodeType,
      dreamTalkFile,
      position,
      additionalFiles
    );

    // Auto-create relationship if in liminal-web mode
    if (shouldAutoRelate && focusedNodeId && newNode) {
      await autoRelateInLiminalWeb(service, newNode, nodeType, focusedNodeId, spatialOrchestratorRef);
    } else if (newNode) {
      // Show success for non-liminal-web drops
      uiService.showSuccess(`Created "${newNode.name}"`);
    }

  } catch (error) {
    console.error('Failed to create node from drop:', error);
    uiService.showError(error instanceof Error ? error.message : 'Failed to create node from drop');
  }
}

/**
 * Handle command+drop for files - opens ProtoNode3D with file pre-filled
 */
export async function handleCommandDrop(files: globalThis.File[]): Promise<void> {
  try {
    const file = files[0];
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');

    // Convert PascalCase file names to human-readable titles
    const { isPascalCase, pascalCaseToTitle } = await import('../dreamnode/utils/title-sanitization');
    const humanReadableTitle = isPascalCase(fileNameWithoutExt)
      ? pascalCaseToTitle(fileNameWithoutExt)
      : fileNameWithoutExt;

    // Use the same position as Create DreamNode command
    const spawnPosition: [number, number, number] = [0, 0, -25];

    // Separate media files from other files
    const mediaFiles = files.filter(f => isValidMediaFile(f));
    const otherFiles = files.filter(f => !isValidMediaFile(f));

    // Use first media file as dreamTalk, rest go to additional files
    const dreamTalkFile = mediaFiles.length > 0 ? mediaFiles[0] : undefined;
    const additionalFiles = [
      ...mediaFiles.slice(1),
      ...otherFiles
    ];

    // Start creation with pre-filled data
    const { startCreationWithData } = useInterBrainStore.getState();
    startCreationWithData(spawnPosition, {
      title: humanReadableTitle,
      type: 'dream',
      dreamTalkFile: dreamTalkFile,
      additionalFiles: additionalFiles.length > 0 ? additionalFiles : undefined
    });

  } catch (error) {
    console.error('Failed to start creation from drop:', error);
    uiService.showError(error instanceof Error ? error.message : 'Failed to start creation from drop');
  }
}

/**
 * Handle normal URL drop on empty space
 */
export async function handleNormalUrlDrop(
  urlData: string,
  position: [number, number, number],
  spatialOrchestratorRef: RefObject<SpatialOrchestratorRef | null>
): Promise<void> {
  try {
    const urlMetadata = await processDroppedUrlData(urlData);

    if (!urlMetadata || !urlMetadata.isValid) {
      uiService.showError('Invalid URL dropped');
      return;
    }

    const service = serviceManager.getActive();

    // Get liminal-web context for auto-relationship
    const { shouldAutoRelate, nodeType, focusedNodeId } = getLiminalWebContext();

    // Create the DreamNode with URL
    let newNode: DreamNode;
    const webLinkAnalyzerReady = serviceManager.isWebLinkAnalyzerReady();

    if (urlMetadata.type === 'website' && service.createFromWebsiteUrl && webLinkAnalyzerReady) {
      const apiKey = serviceManager.getClaudeApiKey();
      newNode = await service.createFromWebsiteUrl(
        urlMetadata.title || urlMetadata.url,
        nodeType,
        urlMetadata,
        position,
        apiKey || undefined
      );
    } else {
      newNode = await service.createFromUrl(
        urlMetadata.title || urlMetadata.url,
        nodeType,
        urlMetadata,
        position
      );
    }

    // Auto-create relationship if in liminal-web mode
    if (shouldAutoRelate && focusedNodeId && newNode) {
      await autoRelateInLiminalWeb(service, newNode, nodeType, focusedNodeId, spatialOrchestratorRef);
    } else if (newNode) {
      // Show success for non-liminal-web drops
      uiService.showSuccess(`Created "${newNode.name}"`);
    }

  } catch (error) {
    console.error('Failed to create node from URL drop:', error);
    uiService.showError(error instanceof Error ? error.message : 'Failed to create node from URL drop');
  }
}

/**
 * Handle command+drop for URLs - opens ProtoNode3D with URL pre-filled
 */
export async function handleCommandUrlDrop(urlData: string): Promise<void> {
  try {
    const urlMetadata = await processDroppedUrlData(urlData);

    if (!urlMetadata || !urlMetadata.isValid) {
      uiService.showError('Invalid URL dropped');
      return;
    }

    const spawnPosition: [number, number, number] = [0, 0, -25];

    const { startCreationWithData } = useInterBrainStore.getState();
    startCreationWithData(spawnPosition, {
      title: urlMetadata.title || urlMetadata.url,
      type: 'dream',
      urlMetadata: urlMetadata
    });

  } catch (error) {
    console.error('Failed to start creation from URL drop:', error);
    uiService.showError(error instanceof Error ? error.message : 'Failed to start creation from URL drop');
  }
}

/**
 * Handle dropping URL on an existing DreamNode
 */
export async function handleUrlDropOnNode(urlData: string, node: DreamNode): Promise<void> {
  try {
    const urlMetadata = await processDroppedUrlData(urlData);

    if (!urlMetadata || !urlMetadata.isValid) {
      uiService.showError('Invalid URL dropped');
      return;
    }

    const service = serviceManager.getActive();
    await service.addUrlToNode(node.id, urlMetadata);

    uiService.showSuccess(`Added URL to "${node.name}"`);

  } catch (error) {
    console.error('Failed to add URL to node:', error);
    uiService.showError(error instanceof Error ? error.message : 'Failed to add URL to node');
  }
}
