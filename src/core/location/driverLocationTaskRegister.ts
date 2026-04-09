import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { ingestDriverLocationObject } from './driverLocationIngest';

/** Must match `TaskManager.defineTask` name and `startLocationUpdatesAsync` first argument. */
export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION';

if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error != null) {
      return;
    }
    if (data == null) {
      return;
    }
    const locations = (data as { locations?: Location.LocationObject[] }).locations;
    if (locations == null || locations.length === 0) {
      return;
    }
    for (const loc of locations) {
      await ingestDriverLocationObject(loc);
    }
  });
}
