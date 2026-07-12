from datetime import datetime

from pydantic import BaseModel, Field, model_validator

# Song notes are short per-track jottings; the long-form field is the album
# comment (capped separately at 10 000). Kept modest to bound stored text.
MAX_NOTE_LEN = 2000


class SongNoteOut(BaseModel):
    track_index: int
    note_text: str

    model_config = {"from_attributes": True}


class RatingOut(BaseModel):
    id: int
    username: str
    album_id: int
    score: float | None
    # 0–5 entries. `None` slots are allowed for in-progress drafts so the
    # client preserves slot positions across saves; publish rejects them.
    top_track_indices: list[int | None] | None
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
    top_track_indices: list[int | None] | None = None
    # keys are track_index (as str in JSON, coerced), values are note text.
    # Setting a key to "" removes the note.
    notes: dict[int, str] | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "RatingPatch":
        if self.top_track_indices is not None:
            if len(self.top_track_indices) > 5:
                raise ValueError("top_track_indices cannot have more than 5 entries")
            non_null = [i for i in self.top_track_indices if i is not None]
            if len(non_null) != len(set(non_null)):
                raise ValueError("top_track_indices must be distinct")
        if self.notes is not None:
            for text in self.notes.values():
                if len(text) > MAX_NOTE_LEN:
                    raise ValueError(f"note text cannot exceed {MAX_NOTE_LEN} characters")
        return self
