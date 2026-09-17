-- Migration to add image_url column to public.products_cache table
ALTER TABLE public.products_cache ADD COLUMN IF NOT EXISTS image_url text;
