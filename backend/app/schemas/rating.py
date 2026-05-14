from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class SongNoteOut(BaseModel):
    track_index: int
    note_text: str

    model_config = {"from_attributes": True}


class RatingOut(BaseModel):
    id: int
    username: str
    album_id: int
    score: float | None
    top_track_indices: list[int] | None
    status: str
    started_at: datetime
    completed_at: datetime | None
    last_edited_at: datetime
    notes: list[SongNoteOut]

    model_config = {"from_attributes": True}


class RatingCreate(BaseModel):
    album_id: int


class RatingPatch(BaseModel):
    score: float | None = Field(None, ge=0, le=10)
    top_track_indices: list[int] | None = None
    # keys are track_index (as str in JSON, coerced), values are note text.
    # Setting a key to "" removes the note.
    notes: dict[int, str] | None = None

    @model_validator(mode="after")
    def validate_top_tracks(self) -> "RatingPatch":
        if self.top_track_indices is not None:
            if len(self.top_track_indices) > 5:
                raise ValueError("top_track_indices cannot have more than 5 entries")
            if len(self.top_track_indices) != len(set(self.top_track_indices)):
                raise ValueError("top_track_indices must be distinct")
        return self
