import React, { useEffect, useState } from 'react';
import { Feather } from 'lucide-react';
import { findSpeciesByScientificName } from '../data/argentinaBirdsCatalog';
import { fetchReferencePhotosForSpecies } from '../services/speciesReferenceService';
import { SpeciesReferencePhoto } from '../types/domain';

interface SpeciesReferenceThumbProps {
  scientificName: string;
  commonNameAr: string;
  initialPhotos?: SpeciesReferencePhoto[];
  fallbackPlate?: string;
  size?: number;
  className?: string;
}

export const SpeciesReferenceThumb: React.FC<SpeciesReferenceThumbProps> = ({
  scientificName,
  commonNameAr,
  initialPhotos,
  fallbackPlate,
  size = 74,
  className = '',
}) => {
  const catalog = findSpeciesByScientificName(scientificName);
  const seedUrl =
    initialPhotos?.[0]?.thumbUrl ||
    initialPhotos?.[0]?.url ||
    catalog?.referencePhotos?.[0]?.thumbUrl ||
    catalog?.referencePhotos?.[0]?.url ||
    '';

  const [photoUrl, setPhotoUrl] = useState<string>(seedUrl);
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (seedUrl) {
      setPhotoUrl(seedUrl);
      setFailed(false);
      return;
    }

    fetchReferencePhotosForSpecies(scientificName).then((photos) => {
      if (!active) return;
      if (photos.length > 0) {
        setPhotoUrl(photos[0].thumbUrl || photos[0].url);
        setFailed(false);
      }
    });

    return () => {
      active = false;
    };
  }, [scientificName, seedUrl]);

  const resolvedUrl = (!failed && photoUrl) || fallbackPlate || '';

  return (
    <div
      className={`species-ref-thumb ${className}`}
      style={{ width: size, height: size, minWidth: size }}
    >
      {resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt={`Foto de referencia de ${commonNameAr}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="species-ref-thumb-fallback" aria-hidden="true">
          <Feather size={22} color="#38573E" />
        </div>
      )}
    </div>
  );
};
